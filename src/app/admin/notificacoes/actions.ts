"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`/admin/notificacoes?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Liga ou desliga os avisos de cada módulo, e ajusta o lembrete. */
export async function salvarConfigAvisos(formData: FormData) {
  await requireOwner();

  const hora = Number(formData.get("hora_lembrete"));
  const maximo = Number(formData.get("max_por_acesso"));

  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    voltar("erro", "A hora do lembrete precisa ser um número de 0 a 23.");
  }
  if (!Number.isInteger(maximo) || maximo < 0 || maximo > 3) {
    voltar("erro", "O máximo de balões por acesso deve ser de 0 a 3.");
  }

  const admin = createAdminClient();

  const { data: modulos } = await admin
    .from("notificacao_config")
    .select("modulo");

  const ligados = new Set(formData.getAll("modulo").map(String));
  const agora = new Date().toISOString();

  for (const m of modulos ?? []) {
    await admin
      .from("notificacao_config")
      .update({ ativa: ligados.has(m.modulo), atualizado_em: agora })
      .eq("modulo", m.modulo);
  }

  const { error } = await admin
    .from("notificacao_ajustes")
    .update({ hora_lembrete_feedback: hora, max_por_acesso: maximo })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar("sucesso", "Configuração salva.");
}

/**
 * Silencia um aviso já publicado.
 *
 * Não apaga: o registro de quem já viu continua valendo. Só some das telas.
 */
export async function silenciarAviso(formData: FormData) {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (!id) voltar("erro", "Aviso inválido.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("notificacoes")
    .update({ ativa: false })
    .eq("id", id);

  if (error) voltar("erro", error.message);
  voltar("sucesso", "Aviso retirado do ar.");
}
