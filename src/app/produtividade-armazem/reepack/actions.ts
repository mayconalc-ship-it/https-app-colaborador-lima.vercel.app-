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
 * A embalagem não é mais escolhida na tela -- vem junto do produto
 * (pa_produtos.embalagem_id), gravada aqui para a meta de tempo por
 * tipo continuar funcionando sem mudar o resto do painel.
 *
 * A trava contra dois lançamentos abertos ao mesmo tempo é o índice
 * único parcial no banco (migration 052); aqui só traduzimos a
 * violação numa mensagem legível.
 */
export async function iniciarReepack(formData: FormData) {
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
    erro("Este produto ainda não está pronto para reepack -- peça ao Admin para vincular a embalagem em Configuração.");
  }

  const { error } = await supabase.from("pa_reepack_lancamentos").insert({
    revenda_id: revendaId,
    embalagem_id: produto.embalagem_id,
    produto_id: produto.id,
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

/**
 * Fecha o lançamento em andamento: grava fim = agora, a quantidade de
 * caixas informada, e o litro já calculado (quantidade x Fator Hecto do
 * produto x 100) -- GRAVADO, não recalculado depois se o fator mudar
 * (mesmo desenho do litro do despejo, migration 051). Só o próprio
 * dono do lançamento finaliza o dele.
 */
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
  if (quantidade === 0) erro("Informe quantas caixas foram reepackadas.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  const { data: aberto } = await supabase
    .from("pa_reepack_lancamentos")
    .select("id, produto_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!aberto) erro("Este lançamento já foi finalizado ou não é seu.");

  let litrosCalculados: number | null = null;
  if (aberto.produto_id) {
    const { data: produto } = await supabase
      .from("pa_produtos")
      .select("fator_hecto")
      .eq("id", aberto.produto_id)
      .maybeSingle();
    if (produto?.fator_hecto != null) {
      litrosCalculados = Math.round(quantidade * produto.fator_hecto * 100 * 100) / 100;
    }
  }

  const { error } = await supabase
    .from("pa_reepack_lancamentos")
    .update({ fim: new Date().toISOString(), quantidade, observacao, litros_calculados: litrosCalculados })
    .eq("id", id);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reepack+finalizado`);
}

/**
 * Corrige o PRODUTO de um lançamento já finalizado -- só isso, e só quem
 * lançou (sem bypass de gestor de propósito: é autocorreção de "escolhi
 * o produto errado", não uma ferramenta de gestão). Início, fim e
 * quantidade NUNCA entram aqui: dá pra corrigir "marquei Guaraná mas era
 * Coca", não dá pra esticar o tempo nem inflar a quantidade pra melhorar
 * a taxa. O litro recalcula a partir da quantidade JÁ gravada x o Fator
 * Hecto do produto novo (mesma regra do lançamento original).
 */
export async function editarReepack(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  const produtoId = String(formData.get("produto_id") ?? "");
  if (!id) erro("Lançamento inválido.");
  if (!produtoId) erro("Escolha o produto certo.");

  const supabase = await createClient();

  const { data: lancamento } = await supabase
    .from("pa_reepack_lancamentos")
    .select("id, quantidade")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .not("fim", "is", null)
    .maybeSingle();

  if (!lancamento) erro("Lançamento não encontrado ou não é seu.");

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("id, embalagem_id, fator_hecto")
    .eq("id", produtoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!produto || !produto.embalagem_id || produto.fator_hecto === null) {
    erro("Este produto ainda não está pronto para reepack -- peça ao Admin para vincular a embalagem em Configuração.");
  }

  const litrosCalculados = Math.round(lancamento.quantidade * produto.fator_hecto * 100 * 100) / 100;

  const { error } = await supabase
    .from("pa_reepack_lancamentos")
    .update({ produto_id: produto.id, embalagem_id: produto.embalagem_id, litros_calculados: litrosCalculados })
    .eq("id", id);

  if (error) erro(`Não foi possível editar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Lançamento+atualizado`);
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
