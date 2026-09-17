import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import {
  FAIXAS_DE_ALERTA,
  HORA_LEMBRETE_PADRAO,
  MODULO_MATERIAL_APOIO,
  chaveDoLembreteDeContagem,
  deveAvisarCompra,
  deveLembrarContagem,
  horaSP,
  inicioDoDiaSP,
  formatarCompra,
  formatarDias,
  formatarReais,
  hojeSP,
  mediaDeSaida,
  situacaoDoEstoque,
  type ContagemDoHistorico,
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
  valor_unitario: number | null;
  media_real_diaria: number | null;
  ativo: boolean;
};

export type UltimaContagem = {
  id: string;
  quantidade: number;
  contado_em: string;
  colaborador_nome: string;
};

const COLUNAS_PRODUTO =
  "id, nome, unidade, linear_quantidade, linear_periodo, politica_minima_dias, politica_objetivo_dias, politica_maxima_dias, antecedencia_alerta_dias, valor_unitario, ativo";

/**
 * Os produtos da revenda, cada um com a última contagem, a média real de
 * saída e a situação de hoje. É o que a tela de contagem, o cadastro e o
 * alerta leem -- a mesma conta nos três.
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
    // As mais recentes primeiro. 1.000 linhas cobrem dezenas de
    // conciliações de cada produto -- mais que os 90 dias da média -- e é o
    // teto do PostgREST de qualquer jeito.
    admin
      .from("ma_contagens")
      .select("id, produto_id, quantidade, entrada, contado_em, colaborador_nome")
      .eq("revenda_id", revendaId)
      .order("contado_em", { ascending: false })
      .limit(1000),
  ]);

  const ultimaDe = new Map<string, UltimaContagem>();
  const historicoDe = new Map<string, ContagemDoHistorico[]>();
  for (const c of contagens ?? []) {
    const produto = String(c.produto_id);
    if (!ultimaDe.has(produto)) {
      ultimaDe.set(produto, {
        id: String(c.id),
        quantidade: Number(c.quantidade),
        contado_em: String(c.contado_em),
        colaborador_nome: String(c.colaborador_nome),
      });
    }
    const lista = historicoDe.get(produto) ?? [];
    lista.push({ quantidade: Number(c.quantidade), entrada: Number(c.entrada ?? 0), contado_em: String(c.contado_em) });
    historicoDe.set(produto, lista);
  }

  const hoje = hojeSP();
  return (produtosBanco ?? []).map((linha) => {
    // Veio da mais nova para a mais antiga; a média lê em ordem cronológica.
    const historico = [...(historicoDe.get(String(linha.id)) ?? [])].reverse();
    const media = mediaDeSaida(historico, hoje);
    const produto: ProdutoMaterial = {
      id: String(linha.id),
      nome: String(linha.nome),
      unidade: String(linha.unidade),
      linear_quantidade: Number(linha.linear_quantidade),
      linear_periodo: String(linha.linear_periodo),
      politica_minima_dias: Number(linha.politica_minima_dias),
      politica_objetivo_dias: Number(linha.politica_objetivo_dias),
      politica_maxima_dias: Number(linha.politica_maxima_dias),
      antecedencia_alerta_dias: Number(linha.antecedencia_alerta_dias),
      valor_unitario: linha.valor_unitario == null ? null : Number(linha.valor_unitario),
      media_real_diaria: media.mediaDiaria,
      ativo: Boolean(linha.ativo),
    };
    const ultima = ultimaDe.get(produto.id) ?? null;
    return { produto, ultima, media, situacao: situacaoDoEstoque(produto, ultima, hoje) };
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
 * mínima" (dentro da antecedência do produto). Toca uma vez por SITUAÇÃO
 * (desde 17/09/2026; antes era por contagem, e a contagem diária virou
 * aviso diário): de novo só se piorar, se entrar material e continuar na
 * faixa, ou depois de REPETIR_ALERTA_DIAS. Ver deveAvisarCompra.
 *
 * Roda depois de cada contagem e de cada mudança no cadastro, e também na
 * varredura periódica: o estoque cai sozinho com o consumo, e o dia em que
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

      // Uma vez por SITUAÇÃO, não por contagem -- ver deveAvisarCompra.
      const { data: ultimoAviso } = await admin
        .from("notificacoes")
        .select("referencia_id, criado_em")
        .eq("modulo", MODULO_MATERIAL_APOIO)
        .like("referencia_id", `material-apoio:${produto.id}:%`)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      let teveEntradaDesde = false;
      if (ultimoAviso) {
        const { count } = await admin
          .from("ma_contagens")
          .select("id", { count: "exact", head: true })
          .eq("revenda_id", revendaId)
          .eq("produto_id", produto.id)
          .gt("entrada", 0)
          .gt("contado_em", String(ultimoAviso.criado_em));
        teveEntradaDesde = (count ?? 0) > 0;
      }
      if (
        !deveAvisarCompra({
          nivelAtual: situacao.faixa as "abaixo-minima" | "perto-minima",
          ultimoNivel: ultimoAviso ? (String(ultimoAviso.referencia_id).split(":").pop() ?? null) : null,
          ultimoEm: ultimoAviso ? String(ultimoAviso.criado_em) : null,
          teveEntradaDesde,
        })
      ) {
        continue;
      }

      const chave = `material-apoio:${produto.id}:${ultima.id}:${situacao.faixa}`;
      const abaixo = situacao.faixa === "abaixo-minima";
      const titulo = `${abaixo ? "🚨" : "⚠️"} ${produto.nome} ${abaixo ? "abaixo da" : "perto da"} política mínima${onde ? ` — ${onde}` : ""}`;
      const valorDaCompra =
        situacao.valorDaCompraObjetivo != null && situacao.valorDaCompraObjetivo > 0
          ? ` (≈ ${formatarReais(situacao.valorDaCompraObjetivo)})`
          : "";
      const mensagem =
        `${formatarDias(situacao.dias)} dias de estoque (mínima ${produto.politica_minima_dias}). ` +
        `Solicite a compra: ~${formatarCompra(situacao.comprarParaObjetivo ?? 0, produto.unidade)}${valorDaCompra} ` +
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

// ------------------------------------------------------------------
// LEMBRETE DIÁRIO DA CONTAGEM (16/09/2026)
// ------------------------------------------------------------------

export type LembreteDeContagem = { ativo: boolean; hora: number; destinatarios: string[] };

/** A configuração do lembrete. Sem linha: desligado, com a hora padrão para a tela. */
export async function lerLembreteDeContagem(revendaId: string): Promise<LembreteDeContagem> {
  const admin = createAdminClient();
  const [{ data: config }, { data: pessoas }] = await Promise.all([
    admin.from("ma_lembrete_config").select("ativo, hora").eq("revenda_id", revendaId).maybeSingle(),
    admin.from("ma_lembrete_destinatarios").select("colaborador_id").eq("revenda_id", revendaId),
  ]);
  return {
    ativo: Boolean(config?.ativo),
    hora: config ? Number(config.hora) : HORA_LEMBRETE_PADRAO,
    destinatarios: (pessoas ?? []).map((p) => String(p.colaborador_id)),
  };
}

/**
 * Quem pode LANÇAR a contagem nesta revenda -- a mesma régua de
 * `requireAcessoModulo`: o módulo liberado para a pessoa, a liderança com
 * "ver" e o Admin. Lembrar alguém de contar sem que ela consiga contar é
 * mandar bater numa porta trancada; por isso a tela só oferece estas
 * pessoas e o servidor descarta as outras.
 */
export async function quemPodeContar(revendaId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const [{ data: extras }, { data: permissoes }, { data: donos }] = await Promise.all([
    admin.from("colaborador_modulos_extra").select("colaborador_id").eq("revenda_id", revendaId).eq("modulo", MODULO_MATERIAL_APOIO),
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_MATERIAL_APOIO)
      .eq("acao", "ver"),
    admin.from("profiles").select("id").eq("role", "owner"),
  ]);
  const liderancaIds = [...new Set((permissoes ?? []).map((p) => String(p.colaborador_id)))];
  const { data: liderancas } = liderancaIds.length
    ? await admin.from("profiles").select("id").in("id", liderancaIds).eq("role", "lideranca")
    : { data: [] };
  return new Set([
    ...(extras ?? []).map((e) => String(e.colaborador_id)),
    ...(liderancas ?? []).map((l) => String(l.id)),
    ...(donos ?? []).map((d) => String(d.id)),
  ]);
}

async function contouHoje(revendaId: string, agora: Date) {
  const admin = createAdminClient();
  const { count } = await admin
    .from("ma_contagens")
    .select("id", { count: "exact", head: true })
    .eq("revenda_id", revendaId)
    .gte("contado_em", inicioDoDiaSP(agora));
  return (count ?? 0) > 0;
}

/**
 * O AVISO DO DIA, chamado pela varredura a cada poucos minutos.
 *
 * Sai uma vez por dia por revenda (a chave leva a data), depois da hora
 * escolhida e só se ninguém contou hoje. Quem é avisado e não pode mais
 * contar (perdeu o módulo) fica de fora na hora do envio.
 */
export async function lembrarContagensDoDia(agora: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data: configs } = await admin
    .from("ma_lembrete_config")
    .select("revenda_id, hora")
    .eq("ativo", true)
    .lte("hora", horaSP(agora));

  let enviados = 0;
  for (const c of configs ?? []) {
    const revendaId = String(c.revenda_id);
    try {
      const chave = chaveDoLembreteDeContagem(revendaId, hojeSP(agora));
      const { data: jaFoi } = await admin
        .from("notificacoes")
        .select("id")
        .eq("modulo", "material-apoio-contagem")
        .eq("referencia_id", chave)
        .limit(1)
        .maybeSingle();
      if (jaFoi) continue;

      const [{ data: modulo }, lembrete, podem, contou] = await Promise.all([
        admin.from("revenda_modulos").select("ativo").eq("revenda_id", revendaId).eq("modulo", MODULO_MATERIAL_APOIO).maybeSingle(),
        lerLembreteDeContagem(revendaId),
        quemPodeContar(revendaId),
        contouHoje(revendaId, agora),
      ]);
      if (!modulo?.ativo) continue;
      if (!deveLembrarContagem({ ativo: lembrete.ativo, hora: lembrete.hora, horaAgora: horaSP(agora), contouHoje: contou })) {
        continue;
      }
      const destinatarios = lembrete.destinatarios.filter((id) => podem.has(id));
      if (destinatarios.length === 0) continue;

      const titulo = "🧰 Contagem do material de apoio";
      const mensagem =
        "Ainda não houve contagem hoje. Conte o filme, o fitilho e os outros materiais — é a contagem diária que mostra quanto sai de verdade.";
      const url = "/material-de-apoio";

      await Promise.all(
        destinatarios.map((id) =>
          criarNotificacao({
            modulo: "material-apoio-contagem",
            tipo: "pendencia",
            titulo,
            mensagem,
            url,
            revendaId,
            destinatarioId: id,
            referenciaId: chave,
          }),
        ),
      );
      await enviarPushDaRevenda(revendaId, {
        modulo: "material-apoio-contagem",
        titulo,
        mensagem,
        url,
        apenas: destinatarios,
        qualquerRevenda: true,
      });
      enviados++;
    } catch {
      // Uma revenda com problema não impede o aviso da outra.
    }
  }
  return enviados;
}

/**
 * A contagem foi feita: o aviso de hoje sai do sino de todo mundo. Deixá-lo
 * lá faria a próxima pessoa contar de novo o que já foi contado.
 * NUNCA lança erro: a contagem já foi gravada.
 */
export async function encerrarLembreteDeContagem(revendaId: string, agora: Date = new Date()) {
  try {
    const admin = createAdminClient();
    await admin
      .from("notificacoes")
      .update({ ativa: false })
      .eq("modulo", "material-apoio-contagem")
      .eq("referencia_id", chaveDoLembreteDeContagem(revendaId, hojeSP(agora)));
  } catch {
    // Silêncio proposital.
  }
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
