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

// -------------------- QUEM PODE LANCAR O TRANSITO --------------------
/**
 * A liberacao mora AQUI, na configuracao do Ativo de Giro, e nao em
 * Acessos por Pessoa -- pedido do dono (03/09/2026).
 *
 * O motivo e de fluxo, nao de tecnica: quem cuida do parque nao e quem
 * cuida do mapa de permissao do app. Obrigar a passar por Acessos para
 * liberar uma pessoa transformaria uma tarefa da controladoria num
 * chamado para o Admin -- e a liberacao ficaria esperando dias por uma
 * conta que dura minutos.
 *
 * Quem LIBERA continua precisando de "ativo-giro:editar", que e a mesma
 * permissao de mexer no parque: nao ha escalada aqui, so um atalho para
 * quem ja podia.
 */
export async function liberarTransito(formData: FormData) {
  const eu = await requireModulo("ativo-giro", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  if (!colaboradorId) erro("Escolha a pessoa.");

  const admin = createAdminClient();
  const { error } = await admin.from("ag_transito_liberados").upsert(
    {
      revenda_id: revendaId,
      colaborador_id: colaboradorId,
      liberado_por: eu.id,
    },
    { onConflict: "revenda_id,colaborador_id" },
  );

  if (error) erro(`Nao foi possivel liberar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Liberado para lancar o transito")}`);
}

export async function tirarLiberacaoTransito(formData: FormData) {
  await requireModulo("ativo-giro", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  if (!colaboradorId) erro("Pessoa invalida.");

  const admin = createAdminClient();
  // O que ela ja lancou FICA: o transito de ontem e um fato do dia
  // dele, e apaga-lo mudaria uma conciliacao ja fechada.
  await admin
    .from("ag_transito_liberados")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId);

  revalidatePath(ROTA);
  revalidatePath("/ativo-de-giro");
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Liberacao retirada. O que ja foi lancado continua valendo.")}`);
}

/** Pessoas da revenda cujo nome ou CPF batem -- alimenta a busca da
 *  liberacao, para nao listar 67 nomes de uma vez. */
export async function buscarParaLiberarTransito(termo: string) {
  await requireModulo("ativo-giro", "editar");
  const revendaId = await exigirRevenda(ROTA);
  if (termo.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const ids = (vinculos ?? []).map((v) => v.colaborador_id);
  if (ids.length === 0) return [];

  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  let consulta = admin.from("profiles").select("id, nome, cargo").in("id", ids).limit(10);
  consulta = digitos
    ? consulta.or(`nome.ilike.%${t}%,cpf.ilike.%${digitos}%`)
    : consulta.ilike("nome", `%${t}%`);
  const { data } = await consulta;
  return data ?? [];
}
