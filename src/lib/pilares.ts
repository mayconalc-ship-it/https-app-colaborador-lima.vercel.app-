import { createClient } from "@/lib/supabase/server";
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

export async function listarPilares(
  incluirOcultos = false,
): Promise<PilarCadastrado[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("padroes_pilares")
    .select("id, nome, ordem, visivel")
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
