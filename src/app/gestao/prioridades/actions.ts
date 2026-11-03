"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_PRIORIDADES } from "@/lib/prioridades";

// O cadastro (link, GVs e motivos) mora em Configuração: admin/prioridades.
const ROTA = "/gestao/prioridades";

/** Tira uma prioridade lançada por engano (código errado, PDV repetido). */
export async function removerPrioridade(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo(MODULO_PRIORIDADES, "editar", ROTA);
    const revendaId = await exigirRevenda(ROTA);
    const id = String(fd.get("id") ?? "").trim();
    const { data, error } = await createAdminClient()
      .from("prioridades")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .select("cod_pdv");
    if (error) pararComErro(`Não foi possível tirar: ${error.message}`);
    if (!data?.length) pararComErro("Essa prioridade já não estava na lista.");
    revalidatePath(ROTA);
    return deuCerto(`PDV ${data[0].cod_pdv} saiu da lista.`);
  });
}
