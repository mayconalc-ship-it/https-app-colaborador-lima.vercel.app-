import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  CAMPOS_DE_TEXTO_DO_MES,
  CONFIG_PADRAO,
  EH_FUNCAO,
  EH_FUNCAO_DA_ATIVIDADE,
  FUNCOES,
  type FuncaoDaAtividade,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  mesesDoPlanejamento,
  rotuloCurto,
  type Alteracao,
  RUBRICAS,
  SALARIO_ZERADO,
  type ConfigMaoDeObra,
  type FuncaoId,
  type MesMaoDeObra,
  type LancamentoDoDia,
  type ProjecaoCongelada,
  type Salario,
  type StatusAcao,
} from "@/lib/mao-de-obra";

/** "AAAA-MM" -> "AAAA-MM-01", que é como a competência mora no banco. */
export const primeiroDia = (competencia: string) => `${competencia}-01`;

/** O padrão da revenda: vale para o mês que não tem configuração antes dele. */
export async function lerConfig(revendaId: string): Promise<ConfigMaoDeObra> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_config")
    .select("*")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  return data ? paraConfig(data) : { ...CONFIG_PADRAO };
}

/*
  A CONFIGURAÇÃO CONGELADA POR MÊS (migration 152, pedido do dono em
  29/09/2026: "caso contrário ela mexe nos outros meses"). Cada mês tem a
  sua cópia; o mês sem cópia usa a do último mês anterior que tem, e sem
  nenhuma antes dele, o padrão da revenda.
*/
export type ConfigDoMes = {
  config: ConfigMaoDeObra;
  /** De que mês veio: o próprio, um anterior ("AAAA-MM"), ou null = padrão da revenda. */
  origem: string | null;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
};

/** A configuração vigente de cada mês pedido, numa leitura só. */
export async function lerConfigsDosMeses(revendaId: string, competencias: string[]): Promise<Map<string, ConfigDoMes>> {
  const saida = new Map<string, ConfigDoMes>();
  if (competencias.length === 0) return saida;
  const ultima = [...competencias].sort().at(-1)!;
  const admin = createAdminClient();
  const [{ data }, padrao] = await Promise.all([
    admin
      .from("mao_obra_config_mes")
      .select("*")
      .eq("revenda_id", revendaId)
      .lte("competencia", primeiroDia(ultima))
      .order("competencia"),
    lerConfig(revendaId),
  ]);
  const linhas = (data ?? []).map((l) => ({ competencia: String(l.competencia).slice(0, 7), linha: l }));
  for (const c of competencias) {
    const vigente = linhas.filter((l) => l.competencia <= c).at(-1);
    saida.set(
      c,
      vigente
        ? {
            config: paraConfig(vigente.linha),
            origem: vigente.competencia,
            atualizadoEm: vigente.linha.atualizado_em ?? null,
            atualizadoPorNome: vigente.linha.atualizado_por_nome ?? null,
          }
        : { config: padrao, origem: null, atualizadoEm: null, atualizadoPorNome: null },
    );
  }
  return saida;
}

export async function lerConfigDoMes(revendaId: string, competencia: string): Promise<ConfigDoMes> {
  return (await lerConfigsDosMeses(revendaId, [competencia])).get(competencia)!;
}

function paraConfig(data: Record<string, unknown>): ConfigMaoDeObra {
  const numero = (v: unknown, padrao: number) => (v == null || Number.isNaN(Number(v)) ? padrao : Number(v));
  const atividade = (v: unknown): FuncaoDaAtividade => (EH_FUNCAO_DA_ATIVIDADE(String(v)) ? (String(v) as FuncaoDaAtividade) : "nenhuma");
  return {
    percentual_montagem: numero(data.percentual_montagem, CONFIG_PADRAO.percentual_montagem),
    perc_blitz_carregamento: numero(data.perc_blitz_carregamento, CONFIG_PADRAO.perc_blitz_carregamento),
    perc_blitz_refugo: numero(data.perc_blitz_refugo, CONFIG_PADRAO.perc_blitz_refugo),
    perc_blitz_puxada: numero(data.perc_blitz_puxada, CONFIG_PADRAO.perc_blitz_puxada),
    tempo_reposicao_picking: numero(data.tempo_reposicao_picking, CONFIG_PADRAO.tempo_reposicao_picking),
    tempo_carregamento_caminhao: numero(data.tempo_carregamento_caminhao, CONFIG_PADRAO.tempo_carregamento_caminhao),
    tma: numero(data.tma, CONFIG_PADRAO.tma),
    hl_carreta: numero(data.hl_carreta, CONFIG_PADRAO.hl_carreta),
    jornada: numero(data.jornada, CONFIG_PADRAO.jornada),
    tempo_blitz: numero(data.tempo_blitz, CONFIG_PADRAO.tempo_blitz),
    hl_por_mapa: numero(data.hl_por_mapa, CONFIG_PADRAO.hl_por_mapa),
    sellout_seg: numero(data.sellout_seg, 0),
    sellout_ter: numero(data.sellout_ter, 0),
    sellout_qua: numero(data.sellout_qua, 0),
    sellout_qui: numero(data.sellout_qui, 0),
    sellout_sex: numero(data.sellout_sex, 0),
    sellout_sab: numero(data.sellout_sab, 0),
    sellout_dom: numero(data.sellout_dom, 0),
    produtividade_montagem: numero(data.produtividade_montagem, 0),
    atividade_montagem: atividade(data.atividade_montagem),
    atividade_reposicao: atividade(data.atividade_reposicao),
    atividade_blitz_refugo: atividade(data.atividade_blitz_refugo),
    atividade_blitz_puxada: atividade(data.atividade_blitz_puxada),
  };
}

export async function lerSalarios(revendaId: string): Promise<Record<FuncaoId, Salario>> {
  const admin = createAdminClient();
  const { data } = await admin.from("mao_obra_salarios").select("*").eq("revenda_id", revendaId);
  const saida = Object.fromEntries(FUNCOES.map((f) => [f.id, { ...SALARIO_ZERADO }])) as Record<FuncaoId, Salario>;
  for (const linha of data ?? []) {
    const funcao = String(linha.funcao);
    if (!EH_FUNCAO(funcao)) continue;
    for (const r of RUBRICAS) saida[funcao][r.id] = Number(linha[r.id] ?? 0);
  }
  return saida;
}

/** Os meses do ano, do mais novo para o mais antigo. */
export async function lerMeses(revendaId: string, ano: number): Promise<MesMaoDeObra[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_meses")
    .select("*")
    .eq("revenda_id", revendaId)
    .gte("competencia", `${ano}-01-01`)
    .lte("competencia", `${ano}-12-01`)
    .order("competencia", { ascending: false });
  return (data ?? []).map(paraMes);
}

export async function lerMes(revendaId: string, competencia: string): Promise<MesMaoDeObra | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_meses")
    .select("*")
    .eq("revenda_id", revendaId)
    .eq("competencia", primeiroDia(competencia))
    .maybeSingle();
  return data ? paraMes(data) : null;
}

function paraMes(linha: Record<string, unknown>): MesMaoDeObra {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const saida: MesMaoDeObra = { ...MES_VAZIO, competencia: String(linha.competencia).slice(0, 7) };
  for (const chave of Object.keys(MES_VAZIO) as (keyof MesMaoDeObra)[]) {
    if (chave === "competencia") continue;
    if ((CAMPOS_DE_TEXTO_DO_MES as readonly string[]).includes(chave)) {
      (saida[chave] as string | null) = (linha[chave] as string) ?? null;
      continue;
    }
    if (chave === "base_meta") {
      saida.base_meta = linha.base_meta === "ppr" ? "ppr" : "negociado";
      continue;
    }
    (saida[chave] as number | null) = num(linha[chave]);
  }
  return saida;
}

export type RevisaoDoMes = { revisadoEm: string | null; revisadoPorNome: string | null };

export async function lerRevisao(revendaId: string, competencia: string): Promise<RevisaoDoMes> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_meses")
    .select("revisado_em, revisado_por_nome")
    .eq("revenda_id", revendaId)
    .eq("competencia", primeiroDia(competencia))
    .maybeSingle();
  return { revisadoEm: data?.revisado_em ?? null, revisadoPorNome: data?.revisado_por_nome ?? null };
}

export async function lerRealizado(
  revendaId: string,
  competencia: string,
): Promise<Partial<Record<FuncaoId, number>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_realizado")
    .select("funcao, quantidade")
    .eq("revenda_id", revendaId)
    .eq("competencia", primeiroDia(competencia));
  const saida: Partial<Record<FuncaoId, number>> = {};
  for (const l of data ?? []) {
    const funcao = String(l.funcao);
    if (EH_FUNCAO(funcao)) saida[funcao] = Number(l.quantidade);
  }
  return saida;
}

/** O realizado de vários meses de uma vez -- para o histórico do ano. */
export async function lerRealizadoDoAno(
  revendaId: string,
  ano: number,
): Promise<Map<string, Partial<Record<FuncaoId, number>>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_realizado")
    .select("competencia, funcao, quantidade")
    .eq("revenda_id", revendaId)
    .gte("competencia", `${ano}-01-01`)
    .lte("competencia", `${ano}-12-01`);
  const saida = new Map<string, Partial<Record<FuncaoId, number>>>();
  for (const l of data ?? []) {
    const comp = String(l.competencia).slice(0, 7);
    const funcao = String(l.funcao);
    if (!EH_FUNCAO(funcao)) continue;
    const atual = saida.get(comp) ?? {};
    atual[funcao] = Number(l.quantidade);
    saida.set(comp, atual);
  }
  return saida;
}

export type AcaoDoPlano = {
  id: string;
  competencia: string;
  funcao: FuncaoId | null;
  oQue: string;
  responsavel: string;
  prazo: string | null;
  status: StatusAcao;
  criadoPorNome: string | null;
  criadoEm: string;
};

export async function lerAcoes(revendaId: string, ano: number): Promise<AcaoDoPlano[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_acoes")
    .select("id, competencia, funcao, o_que, responsavel, prazo, status, criado_por_nome, criado_em")
    .eq("revenda_id", revendaId)
    .gte("competencia", `${ano}-01-01`)
    .lte("competencia", `${ano}-12-01`)
    .order("criado_em", { ascending: false })
    .limit(300);
  return (data ?? []).map((a) => ({
    id: String(a.id),
    competencia: String(a.competencia).slice(0, 7),
    funcao: EH_FUNCAO(String(a.funcao)) ? (String(a.funcao) as FuncaoId) : null,
    oQue: String(a.o_que),
    responsavel: String(a.responsavel),
    prazo: a.prazo ? String(a.prazo).slice(0, 10) : null,
    status: (["aberta", "em_andamento", "concluida"] as const).includes(a.status) ? a.status : "aberta",
    criadoPorNome: a.criado_por_nome ?? null,
    criadoEm: String(a.criado_em),
  }));
}

// ------------------------------------------------------------------
// Vagas para o recrutamento (25/09/2026)
// ------------------------------------------------------------------

export type Destinatario = { id: string; nome: string | null; email: string; ativo: boolean };

export async function lerDestinatarios(revendaId: string): Promise<Destinatario[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_destinatarios")
    .select("id, nome, email, ativo")
    .eq("revenda_id", revendaId)
    .order("email");
  return (data ?? []).map((d) => ({
    id: String(d.id),
    nome: d.nome ?? null,
    email: String(d.email),
    ativo: Boolean(d.ativo),
  }));
}

export type EnvioRegistrado = {
  id: string;
  competencia: string;
  enviadoEm: string;
  enviadoPorNome: string | null;
  destinatarios: string[];
  totalVagas: number;
  vagas: { funcao: string; rotulo?: string; dimensionado: number; atual: number | null; vagas: number }[];
  observacao: string | null;
  /** Quando foi lançado no app -- difere de enviadoEm num registro retroativo. */
  registradoEm: string;
  retroativo: boolean;
};

export async function lerEnvios(revendaId: string, limite = 24): Promise<EnvioRegistrado[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_envios")
    .select("id, competencia, enviado_em, enviado_por_nome, destinatarios, total_vagas, vagas, observacao, registrado_em, retroativo")
    .eq("revenda_id", revendaId)
    .order("enviado_em", { ascending: false })
    .limit(limite);
  return (data ?? []).map((e) => ({
    id: String(e.id),
    competencia: String(e.competencia).slice(0, 7),
    enviadoEm: String(e.enviado_em),
    enviadoPorNome: e.enviado_por_nome ?? null,
    destinatarios: (e.destinatarios ?? []) as string[],
    totalVagas: Number(e.total_vagas ?? 0),
    vagas: (e.vagas ?? []) as EnvioRegistrado["vagas"],
    observacao: e.observacao ?? null,
    registradoEm: String(e.registrado_em ?? e.enviado_em),
    retroativo: Boolean(e.retroativo),
  }));
}

// ------------------------------------------------------------------
// Volume por dia
// ------------------------------------------------------------------

export async function lerDias(
  revendaId: string,
  competencia: string,
): Promise<Map<number, LancamentoDoDia>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_dias")
    .select("dia, volume_realizado, opera, justificativa_motivo, justificativa")
    .eq("revenda_id", revendaId)
    .eq("competencia", primeiroDia(competencia))
    .order("dia");
  const saida = new Map<number, LancamentoDoDia>();
  for (const l of data ?? []) {
    saida.set(Number(l.dia), {
      realizado: l.volume_realizado == null ? null : Number(l.volume_realizado),
      opera: l.opera !== false,
      justificativaMotivo: l.justificativa_motivo ?? null,
      justificativa: l.justificativa ?? null,
    });
  }
  return saida;
}

// ------------------------------------------------------------------
// Por período -- o planejamento atravessa a virada do ano (28/09/2026)
// ------------------------------------------------------------------

/** Os meses lançados entre duas competências, do mais antigo ao mais novo. */
export async function lerMesesDoPeriodo(revendaId: string, de: string, ate: string): Promise<Map<string, MesMaoDeObra>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_meses")
    .select("*")
    .eq("revenda_id", revendaId)
    .gte("competencia", primeiroDia(de))
    .lte("competencia", primeiroDia(ate))
    .order("competencia");
  return new Map((data ?? []).map((l) => [String(l.competencia).slice(0, 7), paraMes(l)]));
}

export async function lerRealizadoDoPeriodo(
  revendaId: string,
  de: string,
  ate: string,
): Promise<Map<string, Partial<Record<FuncaoId, number>>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_realizado")
    .select("competencia, funcao, quantidade")
    .eq("revenda_id", revendaId)
    .gte("competencia", primeiroDia(de))
    .lte("competencia", primeiroDia(ate));
  const saida = new Map<string, Partial<Record<FuncaoId, number>>>();
  for (const l of data ?? []) {
    const comp = String(l.competencia).slice(0, 7);
    const funcao = String(l.funcao);
    if (!EH_FUNCAO(funcao)) continue;
    const atual = saida.get(comp) ?? {};
    atual[funcao] = Number(l.quantidade);
    saida.set(comp, atual);
  }
  return saida;
}

/**
 * O QLP que vale para um mês: o dele, ou o último informado antes dele.
 * Quadro de gente não zera na virada do mês -- quem estava em setembro
 * continua em outubro até alguém atualizar.
 */
export function qlpVigente(
  porMes: Map<string, Partial<Record<FuncaoId, number>>>,
  competencia: string,
): Partial<Record<FuncaoId, number>> {
  const anteriores = [...porMes.keys()].filter((c) => c <= competencia).sort();
  return anteriores.length > 0 ? (porMes.get(anteriores[anteriores.length - 1]) ?? {}) : {};
}

export async function lerAcoesDoPeriodo(revendaId: string, de: string, ate: string): Promise<AcaoDoPlano[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_acoes")
    .select("id, competencia, funcao, o_que, responsavel, prazo, status, criado_por_nome, criado_em")
    .eq("revenda_id", revendaId)
    .gte("competencia", primeiroDia(de))
    .lte("competencia", primeiroDia(ate))
    .order("criado_em", { ascending: false })
    .limit(300);
  return (data ?? []).map((a) => ({
    id: String(a.id),
    competencia: String(a.competencia).slice(0, 7),
    funcao: EH_FUNCAO(String(a.funcao)) ? (String(a.funcao) as FuncaoId) : null,
    oQue: String(a.o_que),
    responsavel: String(a.responsavel),
    prazo: a.prazo ? String(a.prazo).slice(0, 10) : null,
    status: (["aberta", "em_andamento", "concluida"] as const).includes(a.status) ? a.status : "aberta",
    criadoPorNome: a.criado_por_nome ?? null,
    criadoEm: String(a.criado_em),
  }));
}

/** As fotografias da projeção (migration 143) cujo mês-alvo está no período. */
export async function lerProjecoes(revendaId: string, de: string, ate: string): Promise<ProjecaoCongelada[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_projecoes")
    .select("id, competencia_base, competencia_alvo, volume_ppr, volume_negociado, dimensionado, total, qlp, vagas, feita_em, feita_por_nome")
    .eq("revenda_id", revendaId)
    .gte("competencia_alvo", primeiroDia(de))
    .lte("competencia_alvo", primeiroDia(ate))
    .order("feita_em", { ascending: false })
    .limit(500);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return (data ?? []).map((p) => ({
    id: String(p.id),
    competenciaBase: String(p.competencia_base).slice(0, 7),
    competenciaAlvo: String(p.competencia_alvo).slice(0, 7),
    volumePpr: num(p.volume_ppr),
    volumeNegociado: num(p.volume_negociado),
    dimensionado: (p.dimensionado ?? {}) as ProjecaoCongelada["dimensionado"],
    total: Number(p.total ?? 0),
    qlp: (p.qlp ?? null) as ProjecaoCongelada["qlp"],
    vagas: Number(p.vagas ?? 0),
    feitaEm: String(p.feita_em),
    feitaPorNome: p.feita_por_nome ?? null,
  }));
}

// ------------------------------------------------------------------
// Histórico de alterações (migration 151)
// ------------------------------------------------------------------

/**
 * Grava o que mudou. NUNCA derruba o Salvar: a alteração já foi feita, e
 * perder a linha do histórico é menos grave do que recusar o que a pessoa
 * acabou de salvar.
 */
export async function registrarAlteracoes(revendaId: string, alteradoPorNome: string, alteracoes: Alteracao[]) {
  if (alteracoes.length === 0) return;
  try {
    const admin = createAdminClient();
    await admin.from("mao_obra_historico").insert(
      alteracoes.map((a) => ({
        revenda_id: revendaId,
        onde: a.onde,
        competencia: a.competencia ? primeiroDia(a.competencia) : null,
        campo: a.campo,
        rotulo: a.rotulo.slice(0, 120),
        valor_anterior: a.valorAnterior?.slice(0, 500) ?? null,
        valor_novo: a.valorNovo?.slice(0, 500) ?? null,
        alterado_por_nome: alteradoPorNome,
      })),
    );
  } catch {
    // Histórico é acessório ao Salvar -- ver acima.
  }
}

export type AlteracaoLida = Alteracao & { id: string; alteradoEm: string; alteradoPorNome: string | null };

export async function lerHistorico(revendaId: string, limite = 80): Promise<AlteracaoLida[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_historico")
    .select("id, onde, competencia, campo, rotulo, valor_anterior, valor_novo, alterado_em, alterado_por_nome")
    .eq("revenda_id", revendaId)
    .order("alterado_em", { ascending: false })
    .limit(limite);
  return (data ?? []).map((h) => ({
    id: String(h.id),
    onde: h.onde as Alteracao["onde"],
    competencia: h.competencia ? String(h.competencia).slice(0, 7) : null,
    campo: String(h.campo),
    rotulo: String(h.rotulo),
    valorAnterior: h.valor_anterior ?? null,
    valorNovo: h.valor_novo ?? null,
    alteradoEm: String(h.alterado_em),
    alteradoPorNome: h.alterado_por_nome ?? null,
  }));
}

// ------------------------------------------------------------------
// O lembrete mensal (28/09/2026, pedido do dono)
// ------------------------------------------------------------------

/**
 * O V.2 do DPO pede revisão NO MÍNIMO MENSAL, com a estrutura dos meses
 * seguintes formalizada para o time de Gente. Mês esquecido é evidência
 * que falta -- e ninguém percebe até a auditoria.
 *
 * Dois toques por revenda, por mês, e só dois:
 *   DIA 1   a partir das 7h: "hora de revisar e formalizar".
 *   DIA 5   só se o mês ainda NÃO foi formalizado: vira pendência.
 *
 * Quem recebe: o dono e a liderança com "mao-de-obra:editar" na revenda
 * -- quem pode, de fato, lançar o volume e formalizar.
 *
 * Idempotente pela chave (`mao-obra:<revenda>:<AAAA-MM>:dia1|dia5`), como
 * os lembretes do 5S: a varredura passa a cada 5 minutos, e sem a chave o
 * dia 1 sozinho geraria centenas de avisos.
 */
export async function lembrarPlanejamentoMensal(agora: Date = new Date()): Promise<number> {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const competencia = `${pega("year")}-${pega("month")}`;
  const dia = Number(pega("day"));
  const hora = Number(pega("hour"));
  if (hora < 7) return 0;

  const marco: "dia1" | "dia5" | null = dia >= 5 ? "dia5" : dia >= 1 ? "dia1" : null;
  if (!marco) return 0;

  const admin = createAdminClient();
  const { data: ligadas } = await admin
    .from("revenda_modulos")
    .select("revenda_id")
    .eq("modulo", MODULO_MAO_DE_OBRA)
    .eq("ativo", true);

  const horizonte = mesesDoPlanejamento(competencia).map(rotuloCurto).join(", ");
  const url = `/gestao/mao-de-obra?mes=${competencia}&aba=planejar`;
  let enviados = 0;

  for (const l of ligadas ?? []) {
    const revendaId = String(l.revenda_id);

    // O dia 1 sai uma vez; se passou do dia 5 sem nunca ter saído (app
    // publicado no meio do mês), vale o do dia 5, que é o que importa.
    const chave = `mao-obra:${revendaId}:${competencia}:${marco}`;
    const { data: jaFoi } = await admin
      .from("notificacoes")
      .select("id")
      .eq("modulo", "mao-de-obra")
      .eq("referencia_id", chave)
      .limit(1)
      .maybeSingle();
    if (jaFoi) continue;

    if (marco === "dia5") {
      const { data: envio } = await admin
        .from("mao_obra_envios")
        .select("id")
        .eq("revenda_id", revendaId)
        .eq("competencia", primeiroDia(competencia))
        .limit(1)
        .maybeSingle();
      if (envio) continue;
    }

    const [{ data: donos }, { data: permitidos }] = await Promise.all([
      admin.from("profiles").select("id").eq("role", "owner"),
      admin
        .from("lideranca_permissoes")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .eq("modulo", MODULO_MAO_DE_OBRA)
        .eq("acao", "editar"),
    ]);
    const destinatarios = [
      ...new Set([...(donos ?? []).map((d) => String(d.id)), ...(permitidos ?? []).map((p) => String(p.colaborador_id))]),
    ];
    if (destinatarios.length === 0) continue;

    const titulo =
      marco === "dia1" ? "👷 Hora de revisar o quadro de mão de obra" : "⚠️ Planejamento de mão de obra ainda não formalizado";
    const mensagem =
      marco === "dia1"
        ? `Revise o volume e o QLP de ${horizonte} e formalize para o time de Gente.`
        : `O planejamento de ${horizonte} ainda não foi enviado ao time de Gente. É a evidência mensal do DPO 1.2.`;

    await Promise.all(
      destinatarios.map((id) =>
        criarNotificacao({
          modulo: "mao-de-obra",
          tipo: marco === "dia1" ? "lembrete" : "pendencia",
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
      modulo: "mao-de-obra",
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

/** Os anos que já têm mês lançado -- para o seletor de ano. */
export async function anosComDados(revendaId: string): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_meses")
    .select("competencia")
    .eq("revenda_id", revendaId)
    .order("competencia", { ascending: false })
    .limit(200);
  return [...new Set((data ?? []).map((l) => Number(String(l.competencia).slice(0, 4))))];
}
