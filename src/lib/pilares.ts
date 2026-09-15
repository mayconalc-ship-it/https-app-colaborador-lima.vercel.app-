import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { PILARES as PILARES_PADRAO } from "@/lib/padroes-pilares";

export type PilarCadastrado = {
  id: number;
  nome: string;
  ordem: number;
  visivel: boolean;
};

/** Lista de fallback usada só quando não dá para ler a tabela. */
function fallback(): PilarCadastrado[] {
  return PILARES_PADRAO.map((nome, i) => ({
    id: -(i + 1),
    nome,
    ordem: i + 1,
    visivel: true,
  }));
}

/**
 * REVENDA SEM PILAR GANHA OS PILARES PADRÃO (15/09/2026).
 *
 * Barreiras entrou sem nenhuma linha em padroes_pilares. A tela mostrava a
 * lista padrão (fallback), mas o servidor confere no banco -- e recusava
 * todo envio com "Pilar inválido". Tela e servidor com regras diferentes.
 *
 * Agora a lista padrão é GRAVADA para a revenda na primeira vez que ela é
 * necessária, e o que a tela mostra passa a ser o que existe. Idempotente:
 * só grava quando a revenda não tem pilar nenhum, e a chave única
 * (revenda_id, nome) segura duas gravações simultâneas.
 *
 * Com o cliente de administrador: quem abre a tela pode não ter permissão
 * de escrita na tabela, e a garantia não pode depender disso.
 */
export async function garantirPilaresPadrao(revendaId: string): Promise<void> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("padroes_pilares")
    .select("id", { count: "exact", head: true })
    .eq("revenda_id", revendaId);
  if ((count ?? 0) > 0) return;

  await admin.from("padroes_pilares").upsert(
    PILARES_PADRAO.map((nome, i) => ({
      revenda_id: revendaId,
      nome,
      ordem: i + 1,
      visivel: true,
    })),
    { onConflict: "revenda_id,nome", ignoreDuplicates: true },
  );
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

  const ler = () => {
    let consulta = supabase
      .from("padroes_pilares")
      .select("id, nome, ordem, visivel")
      .eq("revenda_id", revendaId)
      .order("ordem", { ascending: true });
    if (!incluirOcultos) consulta = consulta.eq("visivel", true);
    return consulta;
  };

  let { data, error } = await ler();

  // Revenda sem nenhum pilar: grava os padrão e lê de novo (ver acima).
  // Só quando a revenda não tem NENHUM -- com todos ocultos, a lista de
  // visíveis vem vazia e isso não é motivo para recriar nada.
  if (!error && data && data.length === 0) {
    await garantirPilaresPadrao(revendaId);
    ({ data, error } = await ler());
  }

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
