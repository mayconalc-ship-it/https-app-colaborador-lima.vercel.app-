import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { PILARES as PILARES_PADRAO } from "@/lib/padroes-pilares";

export type PilarCadastrado = {
  id: number;
  nome: string;
  ordem: number;
  visivel: boolean;
};

/** Lista de fallback usada antes de a tabela existir/ser populada. */
function fallback(): PilarCadastrado[] {
  return PILARES_PADRAO.map((nome, i) => ({
    id: -(i + 1),
    nome,
    ordem: i + 1,
    visivel: true,
  }));
}

/**
 * Os pilares DESTA revenda.
 *
 * O filtro por revenda precisa estar aqui, e não só na política do banco.
 * A política diz "leia as revendas a que você pertence", e para o dono
 * isso é todas -- então, sem esta linha, ele abria Barreiras e via os
 * pilares de São Félix. A liderança que responde pelas duas via as duas
 * listas somadas.
 *
 * A escrita já era assim desde a 021 (criarPilar grava revenda_id, os
 * updates filtram por ela). Era só a leitura que confiava na política.
 */
export async function listarPilares(
  incluirOcultos = false,
): Promise<PilarCadastrado[]> {
  const revendaId = await getRevendaId();
  if (!revendaId) return fallback();

  const supabase = await createClient();

  let consulta = supabase
    .from("padroes_pilares")
    .select("id, nome, ordem, visivel")
    .eq("revenda_id", revendaId)
    .order("ordem", { ascending: true });

  if (!incluirOcultos) consulta = consulta.eq("visivel", true);

  const { data, error } = await consulta;

  if (error || !data || data.length === 0) return fallback();
  return data;
}

/** Garante que o pilar pedido existe; senão devolve o primeiro da lista. */
export function escolherPilar(
  pilares: PilarCadastrado[],
  pedido?: string,
): string {
  if (pedido && pilares.some((p) => p.nome === pedido)) return pedido;
  return pilares[0]?.nome ?? "Planejamento";
}
