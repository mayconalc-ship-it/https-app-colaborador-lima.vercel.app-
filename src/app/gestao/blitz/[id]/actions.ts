"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";

/**
 * A TRATATIVA DA LIDERANÇA -- o que fecha a blitz.
 *
 * Um campo só, e obrigatório: o que foi feito com o transportador. Sem
 * texto, "tratada" viraria um botão de dar baixa -- e é exatamente a
 * pergunta que o auditor faz ("vocês inspecionam, e depois?"). A resposta
 * tem que estar escrita, não implícita no status.
 */
export async function registrarTratativa(formData: FormData) {
  const perfil = await requireModulo("relato-anomalia", "editar", "/gestao");
  const revendaId = await exigirRevenda("/gestao");

  const id = String(formData.get("blitz_id") ?? "");
  const tratativa = String(formData.get("tratativa") ?? "").trim();
  const destino = `/gestao/blitz/${id}`;

  if (!tratativa) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "Escreva o que foi tratado — é a resposta que o auditor pede depois da inspeção.",
      )}`,
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("pa_blitz")
    .update({
      status: "tratada",
      tratativa,
      tratada_em: new Date().toISOString(),
      tratada_por_nome: perfil.nome,
    })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) redirect(`${destino}?erro=${encodeURIComponent(`Não foi possível gravar: ${error.message}`)}`);

  // Sem redirect: a tela reaparece no mesmo lugar, já como tratada. Um
  // redirect aqui jogaria a rolagem para o topo de uma tela longa.
  revalidatePath(destino);
  revalidatePath("/gestao/anomalias");
}
