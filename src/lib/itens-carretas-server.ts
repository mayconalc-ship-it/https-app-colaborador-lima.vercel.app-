import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerTudoEmPaginas } from "@/lib/rating-server";

/**
 * OS ITENS CONFERIDOS DE VÁRIAS CARRETAS, TODOS (03/10/2026).
 *
 * Achado na varredura: o gatilho de avaria e o Dash do recebimento liam
 * os itens de 90 dias de carretas numa consulta só. Dois jeitos de
 * perder dado sem erro nenhum:
 *
 *   1. O PostgREST devolve no máximo 1.000 linhas. Em 90 dias os itens
 *      passam disso com folga -- a % de avaria saía de uma amostra
 *      cortada, e a blitz (que já paginava) usava outra régua.
 *   2. A lista de ids vai na URL do `.in()`. Com centenas de carretas a
 *      URL passa do limite do servidor e a consulta falha inteira.
 *
 * Aqui os ids vão em LOTES de 150 e cada lote é PAGINADO, com ordem
 * estável (atendimento + id do item) para a virada de página não pular
 * nem repetir linha. Erro de leitura sobe como erro: quem chama decide,
 * e "zero itens" nunca finge ser "nenhuma avaria".
 *
 * É o único lugar que lê esses itens em quantidade -- gatilho, blitz e
 * Dash usam a mesma função, e por isso a mesma régua.
 */
const IDS_POR_LOTE = 150;

export type ItemDaCarreta = {
  atendimento_id: string;
  quantidade: number;
  quantidade_avariada: number | null;
  empilhador?: string | null;
};

export async function lerItensDasCarretas(
  ids: string[],
  { comEmpilhador = false }: { comEmpilhador?: boolean } = {},
  // O cliente de quem chama: o admin no gatilho e na blitz, o do usuário
  // (com RLS) nas telas que já leem assim.
  admin: SupabaseClient = createAdminClient(),
): Promise<ItemDaCarreta[]> {
  const unicos = [...new Set(ids)];
  const campos = `atendimento_id, quantidade, quantidade_avariada${comEmpilhador ? ", empilhador" : ""}`;
  const todos: ItemDaCarreta[] = [];

  for (let i = 0; i < unicos.length; i += IDS_POR_LOTE) {
    const lote = unicos.slice(i, i + IDS_POR_LOTE);
    const { linhas, erro } = await lerTudoEmPaginas<ItemDaCarreta>((de, ate) =>
      admin
        .from("atendimento_carretas_itens")
        .select(campos)
        .in("atendimento_id", lote)
        .order("atendimento_id")
        .order("id")
        .range(de, ate) as unknown as PromiseLike<{ data: ItemDaCarreta[] | null; error: { message: string } | null }>,
    );
    if (erro) throw new Error(`Não foi possível ler os itens das carretas: ${erro}`);
    todos.push(...linhas);
  }
  return todos;
}

/** Os itens agrupados por atendimento, no formato que as contas usam. */
export function porAtendimento(itens: ItemDaCarreta[]) {
  const mapa = new Map<string, { quantidade: number; quantidadeAvariada: number | null }[]>();
  for (const i of itens) {
    const lista = mapa.get(i.atendimento_id) ?? [];
    lista.push({ quantidade: Number(i.quantidade), quantidadeAvariada: i.quantidade_avariada === null ? null : Number(i.quantidade_avariada) });
    mapa.set(i.atendimento_id, lista);
  }
  return mapa;
}
