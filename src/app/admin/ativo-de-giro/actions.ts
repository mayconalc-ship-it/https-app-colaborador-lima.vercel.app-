"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { ehFormato, ehTipo, inteiro } from "@/lib/ativo-giro";

const ROTA = "/admin/ativo-de-giro";

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
