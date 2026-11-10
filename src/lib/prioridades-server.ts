import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DIAS_DA_PRIORIDADE,
  MODULO_PRIORIDADES,
  gvDoPdv,
  lerGvs,
  lerMotivos,
  ordenarAchados,
  ordenarPrioridades,
  prioridadesQueValem,
  somarDias,
  type Gv,
  type PdvAchado,
  type PrioridadeNoMapa,
} from "@/lib/prioridades";
import { codigoDaBase } from "@/lib/clientes-base";

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
  /** O GV marcou PDV novo (migration 176): fora da base é o esperado. */
  pdv_novo: boolean;
  /** A posição que a liderança deu no dia (migration 176); nula = ordem de envio. */
  ordem: number | null;
};

export const CAMPOS_PRIORIDADE = "id, data_entrega, cod_pdv, nome_pdv, motivo, gv_codigo, gv_nome, lote, enviado_em, pdv_novo, ordem";

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
    .select("revenda_id, gvs, motivos")
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

  return { revendaId, revendaNome: revenda.nome as string, gvs: lerGvs(config.gvs), motivos: lerMotivos(config.motivos) };
}

type Config = { tokenPublico: string; gvs: Gv[]; motivos: string[] };

/** O link, os GVs e os motivos da revenda (cria a linha se não existir). */
export async function lerConfig(revendaId: string, admin: Admin = createAdminClient()): Promise<Config> {
  const { data, error } = await admin
    .from("prioridades_config")
    .select("token_publico, gvs, motivos")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  conferir(error);
  const ler = (l: { token_publico: unknown; gvs: unknown; motivos: unknown }): Config => ({
    tokenPublico: l.token_publico as string,
    gvs: lerGvs(l.gvs),
    motivos: lerMotivos(l.motivos),
  });
  if (data) return ler(data);

  const { data: nova, error: e2 } = await admin
    .from("prioridades_config")
    .insert({ revenda_id: revendaId })
    .select("token_publico, gvs, motivos")
    .single();
  conferir(e2);
  return ler(nova!);
}

/**
 * Os PDVs cujo código começa com o que o GV digitou -- a lista que abre
 * debaixo do campo, como nos filtros de produto do app. Só por código:
 * buscar por nome numa página aberta seria entregar a carteira inteira a
 * quem tivesse o link.
 */
export async function procurarPdvsPorCodigo(
  revendaId: string,
  prefixo: string,
  max: number,
  gvs: Gv[],
  admin: Admin = createAdminClient(),
) {
  // O exato à parte: com milhares de códigos começando igual, o corte da
  // busca por prefixo podia deixá-lo de fora -- e ele é o que o GV quer.
  const [exato, { data, error }] = await Promise.all([
    nomesDosPdvs(revendaId, [prefixo], admin),
    admin
      .from("pa_pdv_clientes")
      .select(CAMPOS_CLIENTE)
      .eq("revenda_id", revendaId)
      .like("cod_pdv", `${prefixo}%`)
      .order("cod_pdv")
      .limit(60),
  ]);
  if (error) throw new Error(error.message);
  const rotulo = (gvCodigo: string | null) => (gvCodigo ? gvDoPdv(gvCodigo, gvs).nome : null);
  const achados: PdvAchado[] = ((data ?? []) as LinhaCliente[])
    .filter((c) => c.cod_pdv !== prefixo)
    .map((c) => {
      const l = lerCliente(c);
      return { cod: c.cod_pdv, nome: l.nome, cidade: l.cidade, gv: rotulo(l.gvCodigo) };
    });
  const e = exato.get(prefixo);
  if (e) achados.push({ cod: prefixo, nome: e.nome, cidade: e.cidade, gv: rotulo(e.gvCodigo) });
  return ordenarAchados(achados, max);
}

type LinhaCliente = { cod_pdv: string; nome: string | null; fantasia: string | null; cidade: string | null; gv_codigo?: string | null };
type ClienteResumido = { nome: string | null; cidade: string | null; gvCodigo: string | null };
const CAMPOS_CLIENTE = "cod_pdv, nome, fantasia, cidade, gv_codigo";

const lerCliente = (c: LinhaCliente): ClienteResumido => ({
  nome: (c.fantasia || c.nome) ?? null,
  cidade: c.cidade ?? null,
  gvCodigo: c.gv_codigo ?? null,
});

/**
 * O nome de cada PDV na base de clientes (Fontes de Dados), com a cidade e
 * o GV da carteira. O fantasia primeiro: é como o GV e o motorista
 * conhecem o cliente.
 */
export async function nomesDosPdvs(
  revendaId: string,
  codigos: string[],
  admin: Admin = createAdminClient(),
): Promise<Map<string, ClienteResumido>> {
  const mapa = new Map<string, ClienteResumido>();
  if (codigos.length === 0) return mapa;
  const { data } = await admin.from("pa_pdv_clientes").select(CAMPOS_CLIENTE).eq("revenda_id", revendaId).in("cod_pdv", codigos);
  for (const c of (data ?? []) as LinhaCliente[]) mapa.set(c.cod_pdv, lerCliente(c));
  return mapa;
}

/** As prioridades de um dia de entrega, na ordem da liderança (ordenarPrioridades). */
export async function prioridadesDoDia(revendaId: string, data: string, admin: Admin = createAdminClient()): Promise<Prioridade[]> {
  const { data: linhas, error } = await admin
    .from("prioridades")
    .select(CAMPOS_PRIORIDADE)
    .eq("revenda_id", revendaId)
    .eq("data_entrega", data)
    .limit(1000);
  conferir(error);
  return ordenarPrioridades((linhas ?? []) as Prioridade[]);
}

/*
 * O ENDEREÇO DO GESTOR LOG (04/11/2026, pedido do dono): o Gestor LOG é um
 * arquivo aberto no computador da logística e busca sozinho o que os GVs
 * lançaram. Ele não usa o link do grupo -- quem tem o link do grupo LANÇA,
 * não lê a lista dos outros. A chave de leitura sai do token do link com
 * um segredo do servidor: não precisa de coluna nova, e gerar link novo
 * troca as duas chaves juntas.
 */
export function chaveGestorLog(tokenPublico: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`prioridades-gestor-log:${tokenPublico}`).digest("hex").slice(0, 24);
}

/** A chave do Gestor LOG -> a revenda (nulo se não bate ou o módulo foi desligado). */
export async function resolverChaveGestorLog(chave: string, admin: Admin = createAdminClient()) {
  const limpa = (chave ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(limpa)) return null;
  const { data, error } = await admin.from("prioridades_config").select("token_publico");
  conferir(error);
  const pedida = Buffer.from(limpa);
  const linha = (data ?? []).find((l) => {
    const c = Buffer.from(chaveGestorLog(l.token_publico as string));
    return c.length === pedida.length && timingSafeEqual(c, pedida);
  });
  return linha ? resolverToken(linha.token_publico as string, admin) : null;
}

/** As prioridades das entregas entre duas datas (aaaa-mm-dd), na ordem de envio. */
export async function prioridadesEntre(revendaId: string, de: string, ate: string, admin: Admin = createAdminClient()): Promise<Prioridade[]> {
  const { data, error } = await admin
    .from("prioridades")
    .select(CAMPOS_PRIORIDADE)
    .eq("revenda_id", revendaId)
    .gte("data_entrega", de)
    .lte("data_entrega", ate)
    .order("enviado_em", { ascending: true })
    .limit(5000);
  conferir(error);
  return (data ?? []) as Prioridade[];
}

/**
 * OS PDVs DE PRIORIDADE NUM MAPA -- o que a Minha Rota mostra ao motorista
 * (05/11/2026, pedido do dono). A regra está em prioridadesQueValem: vale
 * a semana a partir da data pedida, até o PDV sair num mapa.
 *
 * Os clientes do mapa vêm de pa_pdv_do_mapa (a lista da pré-rota do dia);
 * o código de lá pode vir com zeros à frente, o das prioridades não.
 * Revenda sem a migration 173 ou sem lista de clientes: mapa sem prioridade.
 */
export async function prioridadesDoMapa(
  revendaId: string,
  mapa: string,
  data: string,
  admin: Admin = createAdminClient(),
): Promise<Map<string, PrioridadeNoMapa>> {
  const vazio = new Map<string, PrioridadeNoMapa>();
  const { data: doMapa } = await admin.from("pa_pdv_do_mapa").select("cod_pdv").eq("revenda_id", revendaId).eq("mapa", mapa).eq("data", data).limit(1000);
  const codigos = [...new Set((doMapa ?? []).map((l) => codigoDaBase(l.cod_pdv)).filter((c): c is string => !!c))];
  if (codigos.length === 0) return vazio;

  const inicio = somarDias(data, -(DIAS_DA_PRIORIDADE - 1));
  const { data: lancadas, error } = await admin
    .from("prioridades")
    .select("cod_pdv, data_entrega, motivo, gv_nome")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos)
    .gte("data_entrega", inicio)
    .lte("data_entrega", data)
    .limit(2000);
  try {
    conferir(error);
  } catch (e) {
    if (e instanceof PrioridadesNaoInstalado) return vazio;
    throw e;
  }
  if (!lancadas?.length) return vazio;

  // Onde esses PDVs já estiveram nos dias anteriores (a prioridade atendida
  // ali não vale mais). O código cru do mapa, nas grafias deste mapa.
  const comPrioridade = new Set(lancadas.map((l) => l.cod_pdv as string));
  const crus = [...new Set((doMapa ?? []).map((l) => l.cod_pdv as string).filter((c) => comPrioridade.has(codigoDaBase(c) ?? "")))];
  const { data: antes } = await admin
    .from("pa_pdv_do_mapa")
    .select("cod_pdv, data")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", crus)
    .gte("data", inicio)
    .lt("data", data)
    .limit(5000);
  const saidas = new Map<string, string[]>();
  for (const l of antes ?? []) {
    const c = codigoDaBase(l.cod_pdv);
    if (c) saidas.set(c, [...(saidas.get(c) ?? []), l.data as string]);
  }

  return prioridadesQueValem(
    lancadas.map((l) => ({ cod: l.cod_pdv as string, dataEntrega: l.data_entrega as string, motivo: l.motivo as string, gv: l.gv_nome as string })),
    saidas,
    data,
  );
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
