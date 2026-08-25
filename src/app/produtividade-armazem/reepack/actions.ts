"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";
import { ehTurno, inteiroNaoNegativo } from "@/lib/produtividade-armazem";

const ROTA = "/produtividade-armazem/reepack";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo(ROTA);

/**
 * Abre o cronômetro: grava o horário de início AGORA, no servidor.
 * `quantidade` e `fim` ficam nulos até o "Finalizar" -- é assim que a
 * tela sabe que este é o lançamento em andamento.
 *
 * A trava contra dois lançamentos abertos ao mesmo tempo é o índice
 * único parcial no banco (migration 052); aqui só traduzimos a
 * violação numa mensagem legível.
 */
export async function iniciarReepack(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const embalagemId = String(formData.get("embalagem_id") ?? "");
  const turno = formData.get("turno");
  if (!embalagemId) erro("Escolha a embalagem.");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();
  const { error } = await supabase.from("pa_reepack_lancamentos").insert({
    revenda_id: revendaId,
    embalagem_id: embalagemId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    turno,
    inicio: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") erro("Você já tem um reepack em andamento. Finalize antes de iniciar outro.");
    erro(`Não foi possível iniciar: ${error.message}`);
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reepack+iniciado`);
}

/** Fecha o lançamento em andamento: grava fim = agora e a quantidade
 *  informada. Só o próprio dono do lançamento finaliza o dele. */
export async function finalizarReepack(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  let quantidade: number;
  try {
    quantidade = inteiroNaoNegativo(formData.get("quantidade"));
  } catch (e) {
    erro(e instanceof Error ? e.message : "Valor inválido.");
  }
  if (quantidade === 0) erro("Informe quantos reepacks foram feitos.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  const { data: aberto } = await supabase
    .from("pa_reepack_lancamentos")
    .select("id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!aberto) erro("Este lançamento já foi finalizado ou não é seu.");

  const { error } = await supabase
    .from("pa_reepack_lancamentos")
    .update({ fim: new Date().toISOString(), quantidade, observacao })
    .eq("id", id);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reepack+finalizado`);
}

/** Desiste de um reepack iniciado por engano -- some sem virar estatística. */
export async function cancelarReepack(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  const supabase = await createClient();
  await supabase
    .from("pa_reepack_lancamentos")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reepack+cancelado`);
}

export async function excluirReepack(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const gestor = await podeNoModulo("produtividade-armazem", "excluir");
  if (gestor) {
    const admin = createAdminClient();
    await admin
      .from("pa_reepack_lancamentos")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pa_reepack_lancamentos")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id);
    if (error) erro("Você só pode excluir os próprios lançamentos.");
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Lançamento+excluído`);
}
