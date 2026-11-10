"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_PRIORIDADES, moverNaOrdem } from "@/lib/prioridades";
import { prioridadesDoDia } from "@/lib/prioridades-server";

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

/**
 * Sobe ou desce uma prioridade na ordem do dia (10/11/2026, pedido do
 * dono). Regrava a posição do dia inteiro, 1, 2, 3...: assim o que chegou
 * sem posição, ou o buraco de uma que foi tirada, se acerta junto.
 */
export async function moverPrioridade(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo(MODULO_PRIORIDADES, "editar", ROTA);
    const revendaId = await exigirRevenda(ROTA);
    const id = String(fd.get("id") ?? "").trim();
    const passo = fd.get("passo") === "descer" ? 1 : -1;
    const admin = createAdminClient();

    const { data: linha, error: e1 } = await admin
      .from("prioridades")
      .select("data_entrega")
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    if (e1) pararComErro(`Não foi possível mudar a ordem: ${e1.message}`);
    if (!linha) pararComErro("Essa prioridade já não estava na lista.");

    const dia = await prioridadesDoDia(revendaId, linha.data_entrega as string, admin);
    const nova = moverNaOrdem(dia.map((p) => p.id), id, passo);
    const atual = new Map(dia.map((p) => [p.id, p.ordem]));
    const mudar = nova.map((pid, i) => ({ pid, ordem: i + 1 })).filter((x) => atual.get(x.pid) !== x.ordem);
    const resultados = await Promise.all(
      mudar.map((x) => admin.from("prioridades").update({ ordem: x.ordem }).eq("id", x.pid).eq("revenda_id", revendaId)),
    );
    const erro = resultados.find((r) => r.error)?.error;
    if (erro) pararComErro(`Não foi possível mudar a ordem: ${erro.message}`);
    revalidatePath(ROTA);
    const cod = dia.find((p) => p.id === id)?.cod_pdv ?? "";
    return deuCerto(`PDV ${cod} agora é o ${nova.indexOf(id) + 1}º do dia.`);
  });
}
