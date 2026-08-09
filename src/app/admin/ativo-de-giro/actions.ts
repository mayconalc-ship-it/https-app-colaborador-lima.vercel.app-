"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo, requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehFormato, ehTipo, inteiro } from "@/lib/ativo-giro";

const ROTA = "/admin/ativo-de-giro";
const MODULO = "ativo-giro";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/** Saldo oficial do parque, por tipo + formato. Base da conciliacao. */
export async function salvarParque(formData: FormData) {
  await requireModulo("ativo-giro", "editar");

  const tipo = formData.get("tipo");
  const formato = formData.get("formato");
  if (!ehTipo(tipo) || !ehFormato(formato)) erro("Item inválido.");

  const quantidade = inteiro(formData.get("quantidade"));

  const admin = createAdminClient();
  const { error } = await admin
    .from("ag_parque")
    .upsert(
      { tipo, formato, quantidade, atualizado_em: new Date().toISOString() },
      { onConflict: "tipo,formato" },
    );

  if (error) erro(`Não foi possível salvar o parque: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?aba=config&sucesso=Parque+atualizado`);
}

/** Caixas por palete e por lastro de cada formato. */
export async function salvarFator(formData: FormData) {
  await requireModulo("ativo-giro", "editar");

  const formato = formData.get("formato");
  if (!ehFormato(formato)) erro("Formato inválido.");

  const palete = inteiro(formData.get("palete"), 10_000);
  const lastro = inteiro(formData.get("lastro"), 10_000);
  if (palete === 0 || lastro === 0) erro("Palete e lastro precisam ser maiores que zero.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("ag_fatores")
    .upsert(
      { formato, palete, lastro, atualizado_em: new Date().toISOString() },
      { onConflict: "formato" },
    );

  if (error) erro(`Não foi possível salvar o fator: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?aba=config&sucesso=Fator+atualizado`);
}

/** Remove uma contagem de qualquer pessoa -- exclusivo de quem tem a permissao. */
export async function excluirContagemAdmin(formData: FormData) {
  await requireModulo("ativo-giro", "excluir");

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) erro("Contagem inválida.");

  const admin = createAdminClient();
  const { error } = await admin.from("ag_contagens").delete().eq("id", id);
  if (error) erro(`Não foi possível excluir: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?aba=historico&sucesso=Contagem+excluída`);
}

/**
 * Libera o modulo para um colaborador comum ver e lancar contagem.
 *
 * Exclusivo do dono -- assim como as demais telas de acesso, isto não pode
 * ser delegado a uma liderança, mesmo uma com controle total do módulo.
 */
export async function concederAcessoAtivoGiro(formData: FormData) {
  const eu = await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Colaborador inválido.");

  const admin = createAdminClient();
  const { error } = await admin.from("colaborador_modulos_extra").upsert(
    { colaborador_id: id, modulo: MODULO, liberado_por: eu.id },
    { onConflict: "colaborador_id,modulo" },
  );

  if (error) erro(`Não foi possível liberar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/");
  redirect(`${ROTA}?aba=acessos&sucesso=Acesso+liberado`);
}

/** Revoga o acesso concedido acima. */
export async function revogarAcessoAtivoGiro(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Colaborador inválido.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .eq("modulo", MODULO);

  if (error) erro(`Não foi possível revogar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/");
  redirect(`${ROTA}?aba=acessos&sucesso=Acesso+revogado`);
}
