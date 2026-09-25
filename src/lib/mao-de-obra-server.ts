import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONFIG_PADRAO,
  EH_FUNCAO,
  FUNCOES,
  MES_VAZIO,
  RUBRICAS,
  SALARIO_ZERADO,
  type ConfigMaoDeObra,
  type FuncaoId,
  type MesMaoDeObra,
  type Salario,
  type StatusAcao,
} from "@/lib/mao-de-obra";

/** "AAAA-MM" -> "AAAA-MM-01", que é como a competência mora no banco. */
export const primeiroDia = (competencia: string) => `${competencia}-01`;

export async function lerConfig(revendaId: string): Promise<ConfigMaoDeObra> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_config")
    .select("*")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!data) return { ...CONFIG_PADRAO };
  const numero = (v: unknown, padrao: number) => (v == null || Number.isNaN(Number(v)) ? padrao : Number(v));
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
    if (chave === "observacao") {
      saida.observacao = (linha.observacao as string) ?? null;
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
};

export async function lerEnvios(revendaId: string, limite = 24): Promise<EnvioRegistrado[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_envios")
    .select("id, competencia, enviado_em, enviado_por_nome, destinatarios, total_vagas, vagas, observacao")
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
  }));
}

// ------------------------------------------------------------------
// Volume por dia
// ------------------------------------------------------------------

export async function lerDias(revendaId: string, competencia: string): Promise<Map<number, number>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mao_obra_dias")
    .select("dia, volume_realizado")
    .eq("revenda_id", revendaId)
    .eq("competencia", primeiroDia(competencia))
    .order("dia");
  const saida = new Map<number, number>();
  for (const l of data ?? []) {
    if (l.volume_realizado != null) saida.set(Number(l.dia), Number(l.volume_realizado));
  }
  return saida;
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
