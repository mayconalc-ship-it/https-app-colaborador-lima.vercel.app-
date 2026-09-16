import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { getModulosDaRevenda } from "@/lib/revendas";
import { lerTudo } from "@/lib/ler-tudo";
import { lerEstoque } from "@/lib/material-apoio-server";
import {
  agruparPorEmbalagem,
  agruparPorProduto,
  construirRanking,
  horasEntre,
  mediaPonderadaPorHoras,
  type EmbalagemDespejo,
  type PontuacaoRanking,
  type ProdutoMeta,
} from "@/lib/produtividade-armazem";
import {
  agoraEmSP,
  chaveDoResumo,
  ehHoraDoResumo,
  frasesDasPendencias,
  rotuloDaSemana,
  semanaAnterior,
  type Semana,
} from "@/lib/resumo-semanal";

type Admin = ReturnType<typeof createAdminClient>;

export type ResumoDoArmazem = {
  /** Só quem teve nota (1h+ apontada), do melhor para o pior. */
  ranking: PontuacaoRanking[];
  pessoas: number;
  horasApontadas: number;
  reepackPctMeta: number | null;
  despejoPctMeta: number | null;
  totalReepacks: number;
  totalDespejoLitros: number;
  hlPicking: number;
  hlBatePalete: number;
};

export type ResumoSemanal = {
  semana: Semana;
  armazem: ResumoDoArmazem | null;
  /** `null` = o módulo não está ligado na revenda. */
  boasPraticas: { emAnalise: number } | null;
  materialApoio: { abaixo: { nome: string; dias: number | null }[]; perto: { nome: string; dias: number | null }[] } | null;
  cincoPorques: { tratativasPendentes: number } | null;
  ativoGiro: { diasContados: number; diasCongelados: number; recontagensAbertas: number } | null;
};

/**
 * O RESUMO DE UMA SEMANA numa revenda. A tela e a notificação leem daqui.
 *
 * O ranking e as metas são DA SEMANA; as pendências são DE AGORA -- uma
 * prática que esperou a semana inteira e foi avaliada no domingo não é
 * mais pendência na segunda, e dizer que é mandaria a liderança atrás de
 * algo resolvido.
 */
export async function montarResumoSemanal(revendaId: string, semana: Semana): Promise<ResumoSemanal> {
  const admin = createAdminClient();
  const modulos = await getModulosDaRevenda(revendaId);

  const [armazem, boasPraticas, materialApoio, cincoPorques, ativoGiro] = await Promise.all([
    modulos.has("produtividade-armazem") ? resumoDoArmazem(admin, revendaId, semana) : null,
    modulos.has("boas-praticas")
      ? admin
          .from("boas_praticas")
          .select("id", { count: "exact", head: true })
          .eq("revenda_id", revendaId)
          .eq("status", "em_analise")
          .then(({ count }) => ({ emAnalise: count ?? 0 }))
      : null,
    modulos.has("material-apoio")
      ? lerEstoque(revendaId).then((estoque) => ({
          abaixo: estoque
            .filter((i) => i.situacao.faixa === "abaixo-minima")
            .map((i) => ({ nome: i.produto.nome, dias: i.situacao.dias })),
          perto: estoque
            .filter((i) => i.situacao.faixa === "perto-minima")
            .map((i) => ({ nome: i.produto.nome, dias: i.situacao.dias })),
        }))
      : null,
    modulos.has("feedbacks")
      ? admin
          .from("cinco_porques_analises")
          .select("id", { count: "exact", head: true })
          .eq("revenda_id", revendaId)
          .eq("status", "concluida")
          .eq("tratativa_status", "pendente")
          .then(({ count }) => ({ tratativasPendentes: count ?? 0 }))
      : null,
    modulos.has("ativo-giro") ? resumoDoAtivoDeGiro(admin, revendaId, semana) : null,
  ]);

  return { semana, armazem, boasPraticas, materialApoio, cincoPorques, ativoGiro };
}

async function resumoDoArmazem(admin: Admin, revendaId: string, semana: Semana): Promise<ResumoDoArmazem> {
  const de0 = `${semana.inicio}T00:00:00-03:00`;
  const ate23 = `${semana.fim}T23:59:59-03:00`;

  // Os mesmos filtros de Indicadores e Ranking (gestao/armazem): só
  // lançamento fechado, pelo início, no fuso da operação.
  const [produtosBanco, embalagensBanco, reepacks, selecoes, despejos, abastecimentos, execucoes5s, batePaletes] =
    await Promise.all([
      lerTudo<{ id: string; descricao: string; meta_reepack_hora: number | null }>((de, ate) =>
        admin.from("pa_produtos").select("id, descricao, meta_reepack_hora").eq("revenda_id", revendaId).order("id").range(de, ate),
      ),
      admin.from("pa_embalagens_despejo").select("id, nome, litros_por_unidade, meta_litros_hora").eq("revenda_id", revendaId),
      lerTudo<{ produto_id: string | null; colaborador_id: string; colaborador_nome: string; quantidade: number; inicio: string; fim: string }>(
        (de, ate) =>
          admin
            .from("pa_reepack_lancamentos")
            .select("produto_id, colaborador_id, colaborador_nome, quantidade, inicio, fim")
            .eq("revenda_id", revendaId)
            .eq("etapa", "repack")
            .not("fim", "is", null)
            .gte("inicio", de0)
            .lte("inicio", ate23)
            .order("inicio")
            .range(de, ate),
      ),
      lerTudo<{ colaborador_id: string; colaborador_nome: string; quantidade: number; inicio: string; fim: string }>((de, ate) =>
        admin
          .from("pa_reepack_lancamentos")
          .select("colaborador_id, colaborador_nome, quantidade, inicio, fim")
          .eq("revenda_id", revendaId)
          .eq("etapa", "selecao")
          .not("fim", "is", null)
          .gte("inicio", de0)
          .lte("inicio", ate23)
          .order("inicio")
          .range(de, ate),
      ),
      lerTudo<{ embalagem_despejo_id: string | null; colaborador_id: string; colaborador_nome: string; litros: number; inicio: string; fim: string }>(
        (de, ate) =>
          admin
            .from("pa_despejo_lancamentos")
            .select("embalagem_despejo_id, colaborador_id, colaborador_nome, litros, inicio, fim")
            .eq("revenda_id", revendaId)
            .not("fim", "is", null)
            .gte("inicio", de0)
            .lte("inicio", ate23)
            .order("inicio")
            .range(de, ate),
      ),
      lerTudo<{ colaborador_id: string; colaborador_nome: string; inicio: string; fim: string; pa_abastecimento_itens: { hl_calculado: number }[] | null }>(
        (de, ate) =>
          admin
            .from("pa_abastecimentos")
            .select("colaborador_id, colaborador_nome, inicio, fim, pa_abastecimento_itens(hl_calculado)")
            .eq("revenda_id", revendaId)
            .not("fim", "is", null)
            .gte("inicio", de0)
            .lte("inicio", ate23)
            .order("inicio")
            .range(de, ate),
      ),
      lerTudo<{ responsavel_id: string; responsavel_nome: string }>((de, ate) =>
        admin
          .from("pa_execucoes_5s")
          .select("responsavel_id, responsavel_nome")
          .eq("revenda_id", revendaId)
          .not("fim", "is", null)
          .gte("inicio", de0)
          .lte("inicio", ate23)
          .order("inicio")
          .range(de, ate),
      ),
      lerTudo<{ colaborador_id: string; colaborador_nome: string; inicio: string; fim: string; pa_bate_palete_itens: { hl_batido: number }[] | null }>(
        (de, ate) =>
          admin
            .from("pa_bate_palete")
            .select("colaborador_id, colaborador_nome, inicio, fim, pa_bate_palete_itens(hl_batido)")
            .eq("revenda_id", revendaId)
            .not("fim", "is", null)
            .gte("inicio", de0)
            .lte("inicio", ate23)
            .order("inicio")
            .range(de, ate),
      ),
    ]);

  const produtos: ProdutoMeta[] = produtosBanco.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    metaReepackHora: p.meta_reepack_hora,
  }));
  const embalagens: EmbalagemDespejo[] = (embalagensBanco.data ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    litrosPorUnidade: e.litros_por_unidade,
    metaLitrosHora: e.meta_litros_hora,
  }));

  const pessoa = (l: { colaborador_id: string; colaborador_nome: string }) => ({
    colaboradorId: l.colaborador_id,
    colaboradorNome: l.colaborador_nome,
  });
  const reepacksR = reepacks.map((r) => ({ ...pessoa(r), produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim }));
  const despejosR = despejos.map((d) => ({
    ...pessoa(d),
    embalagemId: d.embalagem_despejo_id ?? "",
    litros: d.litros,
    inicio: d.inicio,
    fim: d.fim,
  }));
  const pickingsR = abastecimentos.map((a) => ({
    ...pessoa(a),
    quantidade: (a.pa_abastecimento_itens ?? []).reduce((t, i) => t + Number(i.hl_calculado), 0),
    inicio: a.inicio,
    fim: a.fim,
  }));
  const selecoesR = selecoes.map((s) => ({ ...pessoa(s), quantidade: s.quantidade, inicio: s.inicio, fim: s.fim }));
  const batePaletesR = batePaletes.map((b) => ({
    ...pessoa(b),
    quantidade: (b.pa_bate_palete_itens ?? []).reduce((t, i) => t + Number(i.hl_batido), 0),
    inicio: b.inicio,
    fim: b.fim,
  }));

  const ranking = construirRanking(
    reepacksR,
    despejosR,
    pickingsR,
    execucoes5s.map((e) => ({ colaboradorId: e.responsavel_id, colaboradorNome: e.responsavel_nome })),
    produtos,
    embalagens,
    selecoesR,
    batePaletesR,
  );

  // A meta da SEMANA, na mesma conta da nota: ponderada pelas horas.
  const reepackPctMeta = mediaPonderadaPorHoras(
    agruparPorProduto(reepacksR, produtos, (p) => p.metaReepackHora).map((r) => ({ pct: r.pctMeta, horas: r.horas })),
  );
  const despejoPctMeta = mediaPonderadaPorHoras(
    agruparPorEmbalagem(
      despejosR.map((d) => ({ ...d, quantidade: d.litros })),
      embalagens,
      (e) => e.metaLitrosHora,
    ).map((d) => ({ pct: d.pctMeta, horas: d.horas })),
  );

  const soma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 10) / 10;
  return {
    ranking: ranking.filter((r) => r.pontuacao !== null),
    pessoas: ranking.length,
    horasApontadas: soma(
      [...reepacksR, ...despejosR, ...pickingsR, ...selecoesR, ...batePaletesR].map((l) => horasEntre(l.inicio, l.fim)),
    ),
    reepackPctMeta,
    despejoPctMeta,
    totalReepacks: reepacksR.reduce((s, r) => s + r.quantidade, 0),
    totalDespejoLitros: soma(despejosR.map((d) => d.litros)),
    hlPicking: soma(pickingsR.map((p) => p.quantidade)),
    hlBatePalete: soma(batePaletesR.map((b) => b.quantidade)),
  };
}

async function resumoDoAtivoDeGiro(admin: Admin, revendaId: string, semana: Semana) {
  const [contagens, { data: congelados }, { count: recontagens }] = await Promise.all([
    lerTudo<{ data: string }>((de, ate) =>
      admin
        .from("ag_contagens")
        .select("data")
        .eq("revenda_id", revendaId)
        .gte("data", semana.inicio)
        .lte("data", semana.fim)
        .order("data")
        .range(de, ate),
    ),
    admin.from("ag_congelamentos").select("data").eq("revenda_id", revendaId).gte("data", semana.inicio).lte("data", semana.fim),
    admin
      .from("ag_recontagens")
      .select("id", { count: "exact", head: true })
      .eq("revenda_id", revendaId)
      .is("atendida_em", null)
      .is("cancelada_em", null),
  ]);
  return {
    diasContados: new Set(contagens.map((c) => c.data)).size,
    diasCongelados: new Set((congelados ?? []).map((c) => c.data)).size,
    recontagensAbertas: recontagens ?? 0,
  };
}

/** Quem recebe: a liderança vinculada à revenda, e o Admin. */
async function destinatariosDoResumo(admin: Admin, revendaId: string): Promise<string[]> {
  const [{ data: vinculos }, { data: donos }] = await Promise.all([
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
    admin.from("profiles").select("id").eq("role", "owner"),
  ]);
  const ids = (vinculos ?? []).map((v) => String(v.colaborador_id));
  const { data: liderancas } = ids.length
    ? await admin.from("profiles").select("id").in("id", ids).eq("role", "lideranca")
    : { data: [] };
  return [...new Set([...(liderancas ?? []), ...(donos ?? [])].map((p) => String(p.id)))];
}

/**
 * O AVISO DE SEGUNDA-FEIRA, chamado pela varredura (lembretes-server).
 *
 * Uma vez por revenda por semana: a chave leva a segunda da semana
 * resumida, e a varredura passa a cada 5 minutos o dia inteiro. O resumo
 * pesado só é montado quando a chave ainda não existe -- nas outras 200
 * passadas da segunda, a conta é uma consulta.
 */
export async function enviarResumosSemanais(agora: Date = new Date()): Promise<number> {
  if (!ehHoraDoResumo(agora)) return 0;
  const admin = createAdminClient();
  const semana = semanaAnterior(agoraEmSP(agora).dia);
  const { data: revendas } = await admin.from("revendas").select("id, nome").eq("ativa", true);

  let enviados = 0;
  for (const r of revendas ?? []) {
    const chave = chaveDoResumo(String(r.id), semana);
    const { data: jaFoi } = await admin
      .from("notificacoes")
      .select("id")
      .eq("modulo", "resumo-semanal")
      .eq("referencia_id", chave)
      .limit(1)
      .maybeSingle();
    if (jaFoi) continue;

    const destinatarios = await destinatariosDoResumo(admin, String(r.id));
    if (destinatarios.length === 0) continue;

    const resumo = await montarResumoSemanal(String(r.id), semana);
    const onde = String(r.nome ?? "").replace(/^Revenda\s+Lima\s+/i, "").trim();
    const lider = resumo.armazem?.ranking[0];
    const partes = [
      lider ? `🥇 ${primeiroNome(lider.colaboradorNome)} lidera o armazém (${lider.pontuacao} pts)` : null,
      ...frasesDasPendencias({
        praticasEmAnalise: resumo.boasPraticas?.emAnalise ?? null,
        materiaisAbaixoDaMinima: resumo.materialApoio?.abaixo.length ?? null,
        tratativasPendentes: resumo.cincoPorques?.tratativasPendentes ?? null,
        recontagensAbertas: resumo.ativoGiro?.recontagensAbertas ?? null,
      }),
    ].filter(Boolean);
    const titulo = `🗓️ Resumo da semana ${rotuloDaSemana(semana)}${onde ? ` — ${onde}` : ""}`;
    const mensagem = partes.length > 0 ? `${partes.join(" · ")}.` : "Ranking, metas e pendências da semana. Nada pendente.";
    const url = `/gestao/resumo-semanal?semana=${semana.inicio}`;

    await Promise.all(
      destinatarios.map((id) =>
        criarNotificacao({
          modulo: "resumo-semanal",
          tipo: "novo",
          titulo,
          mensagem,
          url,
          revendaId: String(r.id),
          destinatarioId: id,
          referenciaId: chave,
        }),
      ),
    );
    await enviarPushDaRevenda(String(r.id), {
      modulo: "resumo-semanal",
      titulo,
      mensagem,
      url,
      apenas: destinatarios,
      qualquerRevenda: true,
    });
    enviados++;
  }
  return enviados;
}

function primeiroNome(nome: string) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? nome;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}
