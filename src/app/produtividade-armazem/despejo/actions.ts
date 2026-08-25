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

/**
 * Abre o cronômetro do despejo -- mesmo desenho do reepack (ver
 * reepack/actions.ts): inicio real, quantidade e fim ficam nulos até o
 * "Finalizar". A embalagem vem junto do produto escolhido, gravada
 * para a meta de tempo por tipo continuar funcionando.
 */
export async function iniciarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const produtoId = String(formData.get("produto_id") ?? "");
  const turno = formData.get("turno");
  if (!produtoId) erro("Escolha o produto.");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("id, embalagem_id, fator_hecto")
    .eq("id", produtoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!produto || !produto.embalagem_id || produto.fator_hecto === null) {
    erro("Este produto ainda não está pronto para despejo -- peça ao Admin para vincular a embalagem em Configuração.");
  }

  const { error } = await supabase.from("pa_despejo_lancamentos").insert({
    revenda_id: revendaId,
    embalagem_id: produto.embalagem_id,
    produto_id: produto.id,
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

/**
 * Fecha o lançamento: grava fim = agora, converte caixas em litros com
 * o Fator Hecto DE HOJE do produto (não recalcula o passado se o fator
 * mudar depois -- mesmo desenho de antes, só que a fonte do fator
 * agora é o produto, não mais a embalagem digitada a mão).
 */
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
  if (quantidadePacotes === 0) erro("Informe quantas caixas foram despejadas.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  const { data: aberto } = await supabase
    .from("pa_despejo_lancamentos")
    .select("id, produto_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!aberto) erro("Este lançamento já foi finalizado ou não é seu.");

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("fator_hecto")
    .eq("id", aberto.produto_id ?? "")
    .maybeSingle();

  if (!produto?.fator_hecto) {
    erro("Este produto não tem o Fator Hecto cadastrado. Peça ao Admin para conferir em Configuração.");
  }

  const litros = Math.round(quantidadePacotes * produto.fator_hecto * 100 * 100) / 100;

  const { error } = await supabase
    .from("pa_despejo_lancamentos")
    .update({ fim: new Date().toISOString(), quantidade_pacotes: quantidadePacotes, litros, observacao })
    .eq("id", id);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Despejo+finalizado`);
}

/**
 * Corrige a quantidade de caixas de um lançamento já finalizado -- só
 * isso, e só quem lançou (sem bypass de gestor de propósito: é
 * autocorreção de erro de digitação, não uma ferramenta de gestão).
 * Início e fim NUNCA entram aqui: dá pra corrigir "digitei 20 e era
 * 12", não dá pra esticar o tempo do lançamento pra melhorar a taxa.
 * O litro recalcula a partir da quantidade nova (mesmo Fator Hecto
 * gravado na hora do lançamento original).
 */
export async function editarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  let quantidadePacotes: number;
  try {
    quantidadePacotes = inteiroNaoNegativo(formData.get("quantidade_pacotes"));
  } catch (e) {
    erro(e instanceof Error ? e.message : "Valor inválido.");
  }
  if (quantidadePacotes === 0) erro("Informe quantas caixas foram despejadas.");

  const supabase = await createClient();

  const { data: lancamento } = await supabase
    .from("pa_despejo_lancamentos")
    .select("id, produto_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .not("fim", "is", null)
    .maybeSingle();

  if (!lancamento) erro("Lançamento não encontrado ou não é seu.");

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("fator_hecto")
    .eq("id", lancamento.produto_id ?? "")
    .maybeSingle();

  if (!produto?.fator_hecto) {
    erro("Este produto não tem o Fator Hecto cadastrado. Peça ao Admin para conferir em Configuração.");
  }

  const litros = Math.round(quantidadePacotes * produto.fator_hecto * 100 * 100) / 100;

  const { error } = await supabase
    .from("pa_despejo_lancamentos")
    .update({ quantidade_pacotes: quantidadePacotes, litros })
    .eq("id", id);

  if (error) erro(`Não foi possível editar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Lançamento+atualizado`);
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
