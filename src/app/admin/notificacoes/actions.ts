"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { MODULOS_NOTIFICAVEIS } from "@/lib/notificacoes";

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
  const revendaId = await exigirRevenda("/admin/notificacoes");

  const ligados = new Set(formData.getAll("modulo").map(String));
  const agora = new Date().toISOString();

  // Upsert da lista inteira em vez de atualizar o que já existe: numa
  // revenda nova ainda não há linha nenhuma, e o laço antigo não gravaria
  // nada -- a tela diria "salvo" sem ter salvo.
  const linhas = MODULOS_NOTIFICAVEIS.map((modulo) => ({
    revenda_id: revendaId,
    modulo,
    ativa: ligados.has(modulo),
    atualizado_em: agora,
  }));

  const { error: erroModulos } = await admin
    .from("notificacao_config")
    .upsert(linhas, { onConflict: "revenda_id,modulo" });

  if (erroModulos) voltar("erro", erroModulos.message);

  const { error } = await admin.from("notificacao_ajustes").upsert(
    {
      revenda_id: revendaId,
      hora_lembrete_feedback: hora,
      max_por_acesso: maximo,
    },
    { onConflict: "revenda_id" },
  );

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
    .eq("id", id)
    .eq("revenda_id", await exigirRevenda("/admin/notificacoes"));

  if (error) voltar("erro", error.message);
  voltar("sucesso", "Aviso retirado do ar.");
}
