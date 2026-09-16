import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import {
  FAIXAS_DE_ALERTA,
  MODULO_MATERIAL_APOIO,
  formatarDias,
  formatarQuantidade,
  hojeSP,
  situacaoDoEstoque,
} from "@/lib/material-apoio";

export type ProdutoMaterial = {
  id: string;
  nome: string;
  unidade: string;
  linear_quantidade: number;
  linear_periodo: string;
  politica_minima_dias: number;
  politica_objetivo_dias: number;
  politica_maxima_dias: number;
  antecedencia_alerta_dias: number;
  ativo: boolean;
};

export type UltimaContagem = {
  id: string;
  quantidade: number;
  contado_em: string;
  colaborador_nome: string;
};

const COLUNAS_PRODUTO =
  "id, nome, unidade, linear_quantidade, linear_periodo, politica_minima_dias, politica_objetivo_dias, politica_maxima_dias, antecedencia_alerta_dias, ativo";

function normalizarProduto(p: Record<string, unknown>): ProdutoMaterial {
  return {
    id: String(p.id),
    nome: String(p.nome),
    unidade: String(p.unidade),
    linear_quantidade: Number(p.linear_quantidade),
    linear_periodo: String(p.linear_periodo),
    politica_minima_dias: Number(p.politica_minima_dias),
    politica_objetivo_dias: Number(p.politica_objetivo_dias),
    politica_maxima_dias: Number(p.politica_maxima_dias),
    antecedencia_alerta_dias: Number(p.antecedencia_alerta_dias),
    ativo: Boolean(p.ativo),
  };
}

/**
 * Os produtos da revenda, cada um com a última contagem e a situação de
 * hoje. É o que a tela de contagem, o cadastro e o alerta leem -- a mesma
 * conta nos três.
 */
export async function lerEstoque(revendaId: string, opcoes: { incluirInativos?: boolean } = {}) {
  const admin = createAdminClient();
  let consulta = admin
    .from("ma_produtos")
    .select(COLUNAS_PRODUTO)
    .eq("revenda_id", revendaId)
    .order("nome");
  if (!opcoes.incluirInativos) consulta = consulta.eq("ativo", true);

  const [{ data: produtosBanco }, { data: contagens }] = await Promise.all([
    consulta,
    // As mais recentes primeiro: a primeira de cada produto é a última
    // contagem dele. 1.000 linhas cobrem dezenas de conciliações de cada
    // produto -- e é o teto do PostgREST de qualquer jeito.
    admin
      .from("ma_contagens")
      .select("id, produto_id, quantidade, contado_em, colaborador_nome")
      .eq("revenda_id", revendaId)
      .order("contado_em", { ascending: false })
      .limit(1000),
  ]);

  const ultimaDe = new Map<string, UltimaContagem>();
  for (const c of contagens ?? []) {
    const produto = String(c.produto_id);
    if (ultimaDe.has(produto)) continue;
    ultimaDe.set(produto, {
      id: String(c.id),
      quantidade: Number(c.quantidade),
      contado_em: String(c.contado_em),
      colaborador_nome: String(c.colaborador_nome),
    });
  }

  const hoje = hojeSP();
  return (produtosBanco ?? []).map((linha) => {
    const produto = normalizarProduto(linha);
    const ultima = ultimaDe.get(produto.id) ?? null;
    return { produto, ultima, situacao: situacaoDoEstoque(produto, ultima, hoje) };
  });
}

export type ItemDoEstoque = Awaited<ReturnType<typeof lerEstoque>>[number];

/** Quem recebe o alerta de compra nesta revenda. */
export async function destinatariosDoAlerta(revendaId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ma_destinatarios")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  return (data ?? []).map((d) => String(d.colaborador_id));
}

/**
 * Quem abre a tela: quem tem o módulo liberado -- e quem recebe o alerta.
 * Um aviso de "solicite a compra" com um link que responde "sem acesso"
 * é pior do que não avisar.
 */
export async function podeAbrirMaterialDeApoio() {
  if (await temAcessoModulo(MODULO_MATERIAL_APOIO)) return true;
  const [perfil, revendaId] = await Promise.all([getPerfil(), getRevendaId()]);
  if (!perfil || !revendaId) return false;
  if (!(await revendaTemModulo(MODULO_MATERIAL_APOIO))) return false;
  return (await destinatariosDoAlerta(revendaId)).includes(perfil.id);
}

/**
 * O ALERTA DE COMPRA.
 *
 * Dois níveis, a mais grave primeiro: "abaixo da mínima" e "perto da
 * mínima" (dentro da antecedência do produto). Cada nível toca UMA vez por
 * contagem -- a chave leva o id da última contagem, então contar de novo
 * abre um ciclo novo. Quem pulou direto para abaixo da mínima recebe só
 * esse.
 *
 * Roda depois de cada contagem e de cada mudança no cadastro, e também na
 * varredura periódica: o estoque cai sozinho com a linear, e o dia em que
 * ele chega na mínima quase nunca é um dia de contagem.
 *
 * NUNCA lança erro: a contagem já foi gravada.
 */
export async function avisarMaterialDeApoio(revendaId: string): Promise<number> {
  let enviados = 0;
  try {
    const admin = createAdminClient();
    const [estoque, destinatarios, { data: revenda }] = await Promise.all([
      lerEstoque(revendaId),
      destinatariosDoAlerta(revendaId),
      admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle(),
    ]);
    if (destinatarios.length === 0) return 0;

    // "Revenda Lima Barreiras" -> "Barreiras": quem recebe das duas sabe de onde é.
    const onde = (revenda?.nome ?? "").replace(/^Revenda\s+Lima\s+/i, "").trim();

    for (const { produto, ultima, situacao } of estoque) {
      if (!ultima || situacao.dias == null || !FAIXAS_DE_ALERTA.includes(situacao.faixa)) continue;

      // Já avisou este nível -- ou, para "perto", o de "abaixo" -- neste ciclo?
      const niveis = situacao.faixa === "abaixo-minima" ? ["abaixo-minima"] : ["abaixo-minima", "perto-minima"];
      const chaves = niveis.map((n) => `material-apoio:${produto.id}:${ultima.id}:${n}`);
      const { data: jaFoi } = await admin
        .from("notificacoes")
        .select("id")
        .eq("modulo", MODULO_MATERIAL_APOIO)
        .in("referencia_id", chaves)
        .limit(1)
        .maybeSingle();
      if (jaFoi) continue;

      const chave = `material-apoio:${produto.id}:${ultima.id}:${situacao.faixa}`;
      const abaixo = situacao.faixa === "abaixo-minima";
      const titulo = `${abaixo ? "🚨" : "⚠️"} ${produto.nome} ${abaixo ? "abaixo da" : "perto da"} política mínima${onde ? ` — ${onde}` : ""}`;
      const mensagem =
        `${formatarDias(situacao.dias)} dias de estoque (mínima ${produto.politica_minima_dias}). ` +
        `Solicite a compra: ~${formatarQuantidade(situacao.comprarParaObjetivo ?? 0, produto.unidade)} ` +
        `para chegar à política objetiva (${produto.politica_objetivo_dias} dias).`;
      const url = "/material-de-apoio";

      await Promise.all(
        destinatarios.map((id) =>
          criarNotificacao({
            modulo: MODULO_MATERIAL_APOIO,
            tipo: abaixo ? "pendencia" : "lembrete",
            titulo,
            mensagem,
            url,
            revendaId,
            destinatarioId: id,
            referenciaId: chave,
          }),
        ),
      );
      // Em qualquer aparelho de quem foi escolhido: o dono, por exemplo, tem
      // os aparelhos inscritos em outra revenda (ver qualquerRevenda).
      await enviarPushDaRevenda(revendaId, {
        modulo: MODULO_MATERIAL_APOIO,
        titulo,
        mensagem,
        url,
        apenas: destinatarios,
        qualquerRevenda: true,
      });
      enviados++;
    }
  } catch {
    // Silêncio proposital: avisar é secundário, a contagem é o que importa.
  }
  return enviados;
}

/** A varredura periódica: toda revenda com o módulo ligado. */
export async function varrerMaterialDeApoio(): Promise<number> {
  const admin = createAdminClient();
  const { data: revendas } = await admin
    .from("revenda_modulos")
    .select("revenda_id")
    .eq("modulo", MODULO_MATERIAL_APOIO)
    .eq("ativo", true);
  let total = 0;
  for (const r of revendas ?? []) total += await avisarMaterialDeApoio(String(r.revenda_id));
  return total;
}
