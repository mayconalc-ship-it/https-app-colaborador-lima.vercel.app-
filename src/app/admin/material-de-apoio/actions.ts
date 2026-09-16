"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { avisarMaterialDeApoio, quemPodeContar } from "@/lib/material-apoio-server";
import { lerProduto, validarHoraDoLembrete, validarProduto } from "@/lib/material-apoio";

const ROTA = "/admin/material-de-apoio";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

function atualizarTelas() {
  revalidatePath(ROTA);
  revalidatePath("/material-de-apoio");
}

/** Cria ou altera um produto. Mudar linear ou política pode disparar o alerta na hora. */
export async function salvarProduto(formData: FormData) {
  const perfil = await requireModulo("material-apoio", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const dados = lerProduto(formData);
  const problema = validarProduto(dados);
  if (problema) voltar("erro", problema);

  const linha = { ...dados, nome: dados.nome.trim(), atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome };
  const admin = createAdminClient();
  const { data, error } = id
    ? await admin.from("ma_produtos").update(linha).eq("id", id).eq("revenda_id", revendaId).select("id")
    : await admin.from("ma_produtos").insert({ ...linha, revenda_id: revendaId }).select("id");

  if (error) {
    if (error.code === "23505") voltar("erro", "Já existe um produto com esse nome.");
    voltar("erro", `Não foi possível salvar: ${error.message}`);
  }
  if (!data || data.length === 0) voltar("erro", "Produto não encontrado.");

  await avisarMaterialDeApoio(revendaId);
  atualizarTelas();
  voltar("sucesso", id ? "Produto atualizado." : "Produto cadastrado.");
}

/** Desativar some com o produto da contagem sem apagar o histórico dele. */
export async function alternarProduto(formData: FormData) {
  await requireModulo("material-apoio", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!id) voltar("erro", "Produto inválido.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ma_produtos")
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .select("id");
  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  if (!data || data.length === 0) voltar("erro", "Produto não encontrado.");

  atualizarTelas();
  voltar("sucesso", ativo ? "Produto reativado." : "Produto desativado.");
}

/** Apagar de vez -- só produto que nunca foi contado. O contado se desativa. */
export async function excluirProduto(formData: FormData) {
  await requireModulo("material-apoio", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Produto inválido.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("ma_contagens")
    .select("id", { count: "exact", head: true })
    .eq("produto_id", id)
    .eq("revenda_id", revendaId);
  if ((count ?? 0) > 0) {
    voltar("erro", "Este produto já tem contagem. Desative-o para manter o histórico.");
  }

  const { data, error } = await admin.from("ma_produtos").delete().eq("id", id).eq("revenda_id", revendaId).select("id");
  if (error) voltar("erro", `Não foi possível apagar: ${error.message}`);
  if (!data || data.length === 0) voltar("erro", "Produto não encontrado.");

  atualizarTelas();
  voltar("sucesso", "Produto apagado.");
}

/**
 * Quem recebe o alerta de compra -- a lista inteira de uma vez, num Salvar
 * só. Só entra quem é da revenda: um id de fora é ignorado.
 */
export async function salvarDestinatarios(formData: FormData) {
  await requireModulo("material-apoio", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const pedidos = [...new Set(formData.getAll("colaborador_id").map(String).filter(Boolean))];
  const admin = createAdminClient();

  let validos: string[] = [];
  if (pedidos.length > 0) {
    const { data } = await admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .in("colaborador_id", pedidos);
    validos = [...new Set((data ?? []).map((d) => String(d.colaborador_id)))];
  }

  const { error: erroApagar } = await admin.from("ma_destinatarios").delete().eq("revenda_id", revendaId);
  if (erroApagar) voltar("erro", `Não foi possível salvar: ${erroApagar.message}`);
  if (validos.length > 0) {
    const { error } = await admin
      .from("ma_destinatarios")
      .insert(validos.map((colaborador_id) => ({ revenda_id: revendaId, colaborador_id })));
    if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  }

  // Quem acabou de entrar na lista recebe o que já está pendente.
  await avisarMaterialDeApoio(revendaId);
  atualizarTelas();
  voltar(
    "sucesso",
    validos.length > 0
      ? `${validos.length} pessoa${validos.length === 1 ? "" : "s"} recebe${validos.length === 1 ? "" : "m"} o alerta de compra.`
      : "Ninguém recebe o alerta de compra agora.",
  );
}

/**
 * O LEMBRETE DIÁRIO DA CONTAGEM -- liga/desliga, horário e quem recebe,
 * num Salvar só.
 *
 * As mesmas travas da tela: hora dentro da faixa, e só entra quem é da
 * revenda E consegue lançar a contagem (a tela nem oferece as outras
 * pessoas; um id de fora que chegue pelo formulário é descartado aqui).
 * Ligado sem ninguém não vale: seria um lembrete que não toca para ninguém.
 */
export async function salvarLembreteDeContagem(formData: FormData) {
  const perfil = await requireModulo("material-apoio", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const ativo = formData.get("ativo") === "on";
  const hora = validarHoraDoLembrete(formData.get("hora"));
  if ("erro" in hora) voltar("erro", hora.erro);

  const pedidos = [...new Set(formData.getAll("colaborador_id").map(String).filter(Boolean))];
  const admin = createAdminClient();
  const podem = await quemPodeContar(revendaId);

  let validos: string[] = [];
  if (pedidos.length > 0) {
    const { data } = await admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .in("colaborador_id", pedidos);
    validos = [...new Set((data ?? []).map((d) => String(d.colaborador_id)))].filter((id) => podem.has(id));
  }
  if (ativo && validos.length === 0) {
    voltar("erro", "Para ligar o lembrete, escolha pelo menos uma pessoa que possa fazer a contagem.");
  }

  const { error: erroConfig } = await admin.from("ma_lembrete_config").upsert({
    revenda_id: revendaId,
    ativo,
    hora: hora.hora,
    atualizado_em: new Date().toISOString(),
    atualizado_por_nome: perfil.nome,
  });
  if (erroConfig) voltar("erro", `Não foi possível salvar: ${erroConfig.message}`);

  const { error: erroApagar } = await admin.from("ma_lembrete_destinatarios").delete().eq("revenda_id", revendaId);
  if (erroApagar) voltar("erro", `Não foi possível salvar: ${erroApagar.message}`);
  if (validos.length > 0) {
    const { error } = await admin
      .from("ma_lembrete_destinatarios")
      .insert(validos.map((colaborador_id) => ({ revenda_id: revendaId, colaborador_id })));
    if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  }

  atualizarTelas();
  voltar(
    "sucesso",
    ativo
      ? `Lembrete ligado: todo dia às ${hora.hora}h, se ninguém tiver contado, ${validos.length} pessoa${validos.length === 1 ? "" : "s"} recebe${validos.length === 1 ? "" : "m"} o aviso.`
      : "Lembrete da contagem desligado.",
  );
}

/** Apagar uma contagem lançada por engano -- o envio inteiro. */
export async function excluirContagem(formData: FormData) {
  await requireModulo("material-apoio", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const lote = String(formData.get("lote_id") ?? "");
  if (!lote) voltar("erro", "Contagem inválida.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ma_contagens")
    .delete()
    .eq("lote_id", lote)
    .eq("revenda_id", revendaId)
    .select("id");
  if (error) voltar("erro", `Não foi possível apagar: ${error.message}`);
  if (!data || data.length === 0) voltar("erro", "Contagem não encontrada.");

  atualizarTelas();
  voltar("sucesso", "Contagem apagada.");
}
