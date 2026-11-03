import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULO_PRIORIDADES, lerGvs, type Gv } from "@/lib/prioridades";

/**
 * PRIORIDADES DOS GVs -- o lado do banco. A regra está em lib/prioridades.ts.
 *
 * Tudo pelo cliente administrativo: a página do link é pública (os GVs não
 * têm conta no app), então quem decide o que entra é o servidor, com o
 * token do endereço conferido a cada chamada.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** A migration 173 ainda não rodou. A tela avisa em vez de quebrar. */
export class PrioridadesNaoInstalado extends Error {}

export function conferir(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message)) {
    throw new PrioridadesNaoInstalado(error.message);
  }
  throw new Error(error.message);
}

export type Prioridade = {
  id: string;
  data_entrega: string;
  cod_pdv: string;
  nome_pdv: string | null;
  motivo: string;
  gv_codigo: string | null;
  gv_nome: string;
  lote: string;
  enviado_em: string;
};

export const CAMPOS_PRIORIDADE = "id, data_entrega, cod_pdv, nome_pdv, motivo, gv_codigo, gv_nome, lote, enviado_em";

/**
 * O token do link -> a revenda. Nulo quando o token não existe, a revenda
 * está desligada ou o módulo foi desligado nela: o link para de aceitar
 * na mesma hora.
 */
export async function resolverToken(token: string, admin: Admin = createAdminClient()) {
  const limpo = (token ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(limpo)) return null;

  const { data: config, error } = await admin
    .from("prioridades_config")
    .select("revenda_id, gvs")
    .eq("token_publico", limpo)
    .maybeSingle();
  conferir(error);
  if (!config) return null;
  const revendaId = config.revenda_id as string;

  const [{ data: revenda }, { data: ligado }] = await Promise.all([
    admin.from("revendas").select("id, nome, ativa").eq("id", revendaId).maybeSingle(),
    admin
      .from("revenda_modulos")
      .select("ativo")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_PRIORIDADES)
      .maybeSingle(),
  ]);
  if (!revenda || revenda.ativa === false || !ligado?.ativo) return null;

  return { revendaId, revendaNome: revenda.nome as string, gvs: lerGvs(config.gvs) };
}

/** O link e a lista de GVs da revenda (cria a linha se não existir). */
export async function lerConfig(revendaId: string, admin: Admin = createAdminClient()): Promise<{ tokenPublico: string; gvs: Gv[] }> {
  const { data, error } = await admin
    .from("prioridades_config")
    .select("token_publico, gvs")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  conferir(error);
  if (data) return { tokenPublico: data.token_publico as string, gvs: lerGvs(data.gvs) };

  const { data: nova, error: e2 } = await admin
    .from("prioridades_config")
    .insert({ revenda_id: revendaId })
    .select("token_publico, gvs")
    .single();
  conferir(e2);
  return { tokenPublico: nova!.token_publico as string, gvs: lerGvs(nova!.gvs) };
}

/**
 * O nome de cada PDV na base de clientes (Fontes de Dados). O fantasia
 * primeiro: é como o GV e o motorista conhecem o cliente.
 */
export async function nomesDosPdvs(
  revendaId: string,
  codigos: string[],
  admin: Admin = createAdminClient(),
): Promise<Map<string, { nome: string | null; cidade: string | null }>> {
  const mapa = new Map<string, { nome: string | null; cidade: string | null }>();
  if (codigos.length === 0) return mapa;
  const { data } = await admin
    .from("pa_pdv_clientes")
    .select("cod_pdv, nome, fantasia, cidade")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos);
  for (const c of data ?? []) {
    mapa.set(c.cod_pdv as string, {
      nome: ((c.fantasia as string | null) || (c.nome as string | null)) ?? null,
      cidade: (c.cidade as string | null) ?? null,
    });
  }
  return mapa;
}

/** As prioridades de um dia de entrega, as mais novas primeiro. */
export async function prioridadesDoDia(revendaId: string, data: string, admin: Admin = createAdminClient()): Promise<Prioridade[]> {
  const { data: linhas, error } = await admin
    .from("prioridades")
    .select(CAMPOS_PRIORIDADE)
    .eq("revenda_id", revendaId)
    .eq("data_entrega", data)
    .order("enviado_em", { ascending: false })
    .limit(1000);
  conferir(error);
  return (linhas ?? []) as Prioridade[];
}

/** Os dias de entrega com alguma prioridade, dos mais novos para trás. */
export async function diasComPrioridade(revendaId: string, desde: string, admin: Admin = createAdminClient()) {
  const { data, error } = await admin
    .from("prioridades")
    .select("data_entrega")
    .eq("revenda_id", revendaId)
    .gte("data_entrega", desde)
    .order("data_entrega", { ascending: false })
    .limit(5000);
  conferir(error);
  const contagem = new Map<string, number>();
  for (const l of data ?? []) contagem.set(l.data_entrega as string, (contagem.get(l.data_entrega as string) ?? 0) + 1);
  return [...contagem].map(([dia, total]) => ({ dia, total }));
}
