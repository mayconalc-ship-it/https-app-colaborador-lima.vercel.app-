"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioId } from "@/lib/sessao";

export type ResultadoCurtida = { ok: boolean; curtido: boolean; erro?: string };

/**
 * Curte ou descurte uma publicacao. A politica do banco garante que cada
 * colaborador so mexe na propria curtida.
 */
export async function alternarCurtida(
  comunicadoId: number,
  curtidoAgora: boolean,
): Promise<ResultadoCurtida> {
  const usuarioId = await getUsuarioId();
  if (!usuarioId) {
    return { ok: false, curtido: curtidoAgora, erro: "Sessão expirada." };
  }

  const supabase = await createClient();

  if (curtidoAgora) {
    const { error } = await supabase
      .from("comunicado_curtidas")
      .delete()
      .eq("comunicado_id", comunicadoId)
      .eq("colaborador_id", usuarioId);

    if (error) return { ok: false, curtido: true, erro: error.message };
    revalidatePath("/comunicados");
    return { ok: true, curtido: false };
  }

  const { error } = await supabase.from("comunicado_curtidas").insert({
    comunicado_id: comunicadoId,
    colaborador_id: usuarioId,
  });

  // Curtir duas vezes (dois toques rapidos) cai na chave duplicada: nao e
  // erro para o colaborador, o resultado final e o mesmo.
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, curtido: false, erro: error.message };
  }

  revalidatePath("/comunicados");
  return { ok: true, curtido: true };
}
