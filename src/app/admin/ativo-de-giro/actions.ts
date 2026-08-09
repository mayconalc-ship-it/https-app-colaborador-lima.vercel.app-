"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo, requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
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
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin.from("ag_parque").upsert(
    {
      revenda_id: revendaId,
      tipo,
      formato,
      quantidade,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,tipo,formato" },
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
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin.from("ag_fatores").upsert(
    {
      revenda_id: revendaId,
      formato,
      palete,
      lastro,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,formato" },
  );

  if (error) erro(`Não foi possível salvar o fator: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?aba=config&sucesso=Fator+atualizado`);
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
  const revendaId = await exigirRevenda(ROTA);

  // A liberação vale na revenda em que o Admin está. A mesma pessoa pode
  // usar o módulo numa unidade e não na outra.
  const { error } = await admin.from("colaborador_modulos_extra").upsert(
    {
      colaborador_id: id,
      revenda_id: revendaId,
      modulo: MODULO,
      liberado_por: eu.id,
    },
    { onConflict: "colaborador_id,revenda_id,modulo" },
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
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .eq("revenda_id", revendaId)
    .eq("modulo", MODULO);

  if (error) erro(`Não foi possível revogar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/");
  redirect(`${ROTA}?aba=acessos&sucesso=Acesso+revogado`);
}
