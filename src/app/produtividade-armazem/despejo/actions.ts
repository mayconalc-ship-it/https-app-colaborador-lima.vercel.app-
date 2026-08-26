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

const exigirContexto = () => exigirContextoModulo("pa-despejo", ROTA);

/**
 * Abre o cronômetro do despejo -- mesmo desenho do reepack (ver
 * reepack/actions.ts), mas por EMBALAGEM, não por produto (pedido do
 * dono: o despejo é lançado por tipo de embalagem, o produto específico
 * não importa pra essa operação). `produto_id` fica de fora dos
 * lançamentos novos -- a coluna continua existindo só pra não quebrar
 * o histórico de antes desta mudança.
 *
 * A embalagem vem do catálogo PRÓPRIO do despejo (pa_embalagens_despejo,
 * migration 064) -- não mais o mesmo catálogo do Repack.
 */
export async function iniciarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const embalagemId = String(formData.get("embalagem_id") ?? "");
  const turno = formData.get("turno");
  if (!embalagemId) erro("Escolha a embalagem.");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();

  const { data: embalagem } = await supabase
    .from("pa_embalagens_despejo")
    .select("id, litros_por_unidade")
    .eq("id", embalagemId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!embalagem || embalagem.litros_por_unidade === null) {
    erro("Esta embalagem ainda não está pronta para despejo -- peça ao Admin para cadastrar o litro por unidade em Configuração.");
  }

  const { error } = await supabase.from("pa_despejo_lancamentos").insert({
    revenda_id: revendaId,
    embalagem_despejo_id: embalagem.id,
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
 * Fecha o lançamento: grava fim = agora, converte UNIDADES em litros com
 * o litro-por-unidade DE HOJE da embalagem (não recalcula o passado se o
 * valor mudar depois -- mesma regra de sempre). Guarda no mesmo campo
 * `quantidade_pacotes` de sempre -- o nome da coluna ficou, só o que ele
 * representa mudou (unidade, não mais caixa/pacote, desde a 064).
 */
export async function finalizarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lançamento inválido.");

  let quantidade: number;
  try {
    quantidade = inteiroNaoNegativo(formData.get("quantidade_pacotes"));
  } catch (e) {
    erro(e instanceof Error ? e.message : "Valor inválido.");
  }
  if (quantidade === 0) erro("Informe quantas unidades foram despejadas.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  const { data: aberto } = await supabase
    .from("pa_despejo_lancamentos")
    .select("id, embalagem_despejo_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!aberto) erro("Este lançamento já foi finalizado ou não é seu.");

  const { data: embalagem } = await supabase
    .from("pa_embalagens_despejo")
    .select("litros_por_unidade")
    .eq("id", aberto.embalagem_despejo_id)
    .maybeSingle();

  if (!embalagem?.litros_por_unidade) {
    erro("Esta embalagem não tem o litro por unidade cadastrado. Peça ao Admin para conferir em Configuração.");
  }

  const litros = Math.round(quantidade * embalagem.litros_por_unidade * 100) / 100;

  const { error } = await supabase
    .from("pa_despejo_lancamentos")
    .update({ fim: new Date().toISOString(), quantidade_pacotes: quantidade, litros, observacao })
    .eq("id", id);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Despejo+finalizado`);
}

/**
 * Corrige a EMBALAGEM de um lançamento já finalizado -- só isso, e só
 * quem lançou (sem bypass de gestor de propósito: é autocorreção de
 * "escolhi a embalagem errada", não uma ferramenta de gestão). Início,
 * fim e quantidade NUNCA entram aqui: dá pra corrigir "marquei Lata
 * 350ml mas era Lata 269ml", não dá pra esticar o tempo nem inflar a
 * quantidade pra melhorar a taxa. O litro recalcula a partir da
 * quantidade JÁ gravada x o litro-por-unidade da embalagem nova (mesma
 * regra do lançamento original).
 */
export async function editarDespejo(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  const embalagemId = String(formData.get("embalagem_id") ?? "");
  if (!id) erro("Lançamento inválido.");
  if (!embalagemId) erro("Escolha a embalagem certa.");

  const supabase = await createClient();

  const { data: lancamento } = await supabase
    .from("pa_despejo_lancamentos")
    .select("id, quantidade_pacotes")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .not("fim", "is", null)
    .maybeSingle();

  if (!lancamento) erro("Lançamento não encontrado ou não é seu.");
  if (!lancamento.quantidade_pacotes) erro("Este lançamento não tem quantidade gravada.");

  const { data: embalagem } = await supabase
    .from("pa_embalagens_despejo")
    .select("id, litros_por_unidade")
    .eq("id", embalagemId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!embalagem || embalagem.litros_por_unidade === null) {
    erro("Esta embalagem ainda não está pronta para despejo -- peça ao Admin para cadastrar o litro por unidade em Configuração.");
  }

  const litros = Math.round(lancamento.quantidade_pacotes * embalagem.litros_por_unidade * 100) / 100;

  const { error } = await supabase
    .from("pa_despejo_lancamentos")
    .update({ embalagem_despejo_id: embalagem.id, litros })
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
