import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { codigoDaBase } from "@/lib/clientes-base";
import { normalizarMapa } from "@/lib/rotas";

export type ClienteDaRota = {
  codPdv: string;
  /** Fantasia, e na falta dela a Razão Social. Nulo = fora da base. */
  nome: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  telefone: string | null;
};

const limpo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Quem está neste mapa, com o que a base de clientes sabe de cada um.
 *
 * SÓ OS CLIENTES DO MESMO DIA. O número do mapa se repete, e os pedidos de
 * cada dia mudam -- adivinhar pela lista de outro dia já foi medido e deu
 * 88% de cliente errado (ver lib/rotas). Sem a lista do dia, devolve vazio.
 *
 * Mora aqui desde 18/09/2026: a pré-rota e o QR de contingência fazem a
 * MESMA pergunta ("quem está no meu mapa?"), e duas cópias da resposta
 * divergiriam na primeira mudança.
 */
export async function clientesDoMapa(revendaId: string, mapa: string, data: string): Promise<ClienteDaRota[]> {
  const admin = createAdminClient();
  const { data: doMapa } = await admin
    .from("pa_pdv_do_mapa")
    .select("cod_pdv")
    .eq("revenda_id", revendaId)
    .eq("mapa", mapa)
    .eq("data", data)
    .limit(1000);

  const codigos = [
    ...new Set((doMapa ?? []).map((l) => codigoDaBase(l.cod_pdv)).filter((c): c is string => !!c)),
  ];
  if (codigos.length === 0) return [];

  const { data: base, error } = await admin
    .from("pa_pdv_clientes")
    .select("cod_pdv, nome, fantasia, telefone, cidade, bairro, endereco")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos);
  if (error) throw new Error(error.message);

  const porCodigo = new Map((base ?? []).map((c) => [c.cod_pdv as string, c]));
  return codigos.map((cod) => {
    const c = porCodigo.get(cod);
    return {
      codPdv: cod,
      nome: limpo(c?.fantasia) ?? limpo(c?.nome),
      cidade: limpo(c?.cidade),
      bairro: limpo(c?.bairro),
      endereco: limpo(c?.endereco),
      telefone: limpo(c?.telefone),
    };
  });
}

/** O mapa digitado -> a rota mais recente com esse número, e os clientes dela. */
export async function rotaComClientes(
  revendaId: string,
  mapaDigitado: string,
): Promise<{ mapa: string; data: string; clientes: ClienteDaRota[] } | null> {
  const mapa = normalizarMapa(mapaDigitado);
  if (!mapa) return null;
  const admin = createAdminClient();
  const { data: rota } = await admin
    .from("rotas")
    .select("data, mapa")
    .eq("revenda_id", revendaId)
    .eq("mapa", mapa)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rota) return null;
  return { mapa: rota.mapa, data: rota.data, clientes: await clientesDoMapa(revendaId, rota.mapa, rota.data) };
}

/**
 * Busca na base inteira de clientes da revenda -- o caminho quando o mapa
 * não trouxe a lista do dia, ou o cliente não está nele (entrega extra).
 * Por código (exato, sem zeros) ou por pedaço do nome.
 */
export async function buscarNaBaseDeClientes(revendaId: string, termo: string): Promise<ClienteDaRota[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const admin = createAdminClient();
  const codigo = codigoDaBase(t.replace(/\D/g, ""));
  const soDigitos = /^\d+$/.test(t);
  // Aspas e vírgula quebrariam o filtro `or` do PostgREST.
  const texto = t.replace(/[,()"'%]/g, " ").trim();

  let consulta = admin
    .from("pa_pdv_clientes")
    .select("cod_pdv, nome, fantasia, telefone, cidade, bairro, endereco")
    .eq("revenda_id", revendaId)
    .limit(30);
  consulta =
    soDigitos && codigo
      ? consulta.eq("cod_pdv", codigo)
      : consulta.or(`fantasia.ilike.%${texto}%,nome.ilike.%${texto}%`);

  const { data } = await consulta;
  return (data ?? []).map((c) => ({
    codPdv: String(c.cod_pdv),
    nome: limpo(c.fantasia) ?? limpo(c.nome),
    cidade: limpo(c.cidade),
    bairro: limpo(c.bairro),
    endereco: limpo(c.endereco),
    telefone: limpo(c.telefone),
  }));
}
