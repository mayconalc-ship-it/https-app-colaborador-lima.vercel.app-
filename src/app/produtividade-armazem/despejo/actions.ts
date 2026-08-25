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

const ROTA = "/produtividade-armazem/despejo";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo(ROTA);

/** Abre o cronômetro do despejo -- mesmo desenho do reepack (ver
 *  reepack/actions.ts): inicio real, quantidade e fim ficam nulos até
 *  o "Finalizar". */
export async function iniciarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const embalagemId = String(formData.get("embalagem_id") ?? "");
  const turno = formData.get("turno");
  if (!embalagemId) erro("Escolha a embalagem.");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();
  const { error } = await supabase.from("pa_despejo_lancamentos").insert({
    revenda_id: revendaId,
    embalagem_id: embalagemId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    turno,
    inicio: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") erro("Você já tem um despejo em andamento. Finalize antes de iniciar outro.");
    erro(`Não foi possível iniciar: ${error.message}`);
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Despejo+iniciado`);
}

/** Fecha o lançamento: grava fim = agora, converte pacotes em litros
 *  com o fator DE HOJE da embalagem (ver nota em produtividade-armazem-server
 *  sobre não recalcular o passado se o fator mudar). */
export async function finalizarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  let quantidadePacotes: number;
  try {
    quantidadePacotes = inteiroNaoNegativo(formData.get("quantidade_pacotes"));
  } catch (e) {
    erro(e instanceof Error ? e.message : "Valor inválido.");
  }
  if (quantidadePacotes === 0) erro("Informe quantos pacotes foram despejados.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  const { data: aberto } = await supabase
    .from("pa_despejo_lancamentos")
    .select("id, embalagem_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!aberto) erro("Este lançamento já foi finalizado ou não é seu.");

  const { data: embalagem } = await supabase
    .from("pa_embalagens")
    .select("litros_por_pacote")
    .eq("id", aberto.embalagem_id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!embalagem?.litros_por_pacote) {
    erro("Esta embalagem não tem o fator de litros por pacote cadastrado. Peça ao Admin para cadastrar em Configuração.");
  }

  const litros = Math.round(quantidadePacotes * embalagem.litros_por_pacote * 100) / 100;

  const { error } = await supabase
    .from("pa_despejo_lancamentos")
    .update({ fim: new Date().toISOString(), quantidade_pacotes: quantidadePacotes, litros, observacao })
    .eq("id", id);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Despejo+finalizado`);
}

/** Desiste de um despejo iniciado por engano. */
export async function cancelarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  const supabase = await createClient();
  await supabase
    .from("pa_despejo_lancamentos")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Despejo+cancelado`);
}

export async function excluirDespejo(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const gestor = await podeNoModulo("produtividade-armazem", "excluir");
  if (gestor) {
    const admin = createAdminClient();
    await admin.from("pa_despejo_lancamentos").delete().eq("id", id).eq("revenda_id", revendaId);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pa_despejo_lancamentos")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id);
    if (error) erro("Você só pode excluir os próprios lançamentos.");
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Lançamento+excluído`);
}
