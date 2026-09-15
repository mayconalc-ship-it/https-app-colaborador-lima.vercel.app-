"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { LIMITES, apurar, formatarDia, hojeSP } from "@/lib/boas-praticas";

const ROTA = "/admin/boas-praticas";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

function atualizarTelas() {
  revalidatePath(ROTA);
  revalidatePath("/boas-praticas");
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Selecionar para a votação ou não. A recusa exige o motivo: quem sugeriu
 * precisa saber por que -- sem isso, não sugere de novo. A migration 117
 * trava a mesma coisa no banco.
 */
export async function avaliarPratica(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const retorno = String(formData.get("retorno") ?? "").trim().slice(0, LIMITES.retornoMax);

  if (!id) voltar("erro", "Prática inválida.");
  if (decisao !== "selecionada" && decisao !== "nao_selecionada") voltar("erro", "Escolha a decisão.");
  if (decisao === "nao_selecionada" && !retorno) {
    voltar("erro", "Escreva para a pessoa por que a prática não foi selecionada.");
  }

  const admin = createAdminClient();
  const { data: avaliadas, error } = await admin
    .from("boas_praticas")
    .update({
      status: decisao,
      retorno: retorno || null,
      avaliado_por_id: perfil.id,
      avaliado_por_nome: perfil.nome,
      avaliado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("status", "em_analise")
    .select("id, colaborador_id, titulo");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  const pratica = avaliadas?.[0];
  if (!pratica) voltar("erro", "Esta prática já foi avaliada por outra pessoa.");

  const selecionada = decisao === "selecionada";
  const titulo = selecionada
    ? `✅ Sua prática “${pratica.titulo}” foi selecionada`
    : `Sua prática “${pratica.titulo}” não foi selecionada desta vez`;
  const mensagem =
    retorno || "Ela vai para a próxima votação. Boa sorte!";
  const url = "/boas-praticas?aba=minhas";

  await criarNotificacao({
    modulo: "boas-praticas",
    tipo: "atualizado",
    titulo,
    mensagem,
    url,
    referenciaId: pratica.id,
    criadoPor: perfil.nome,
    destinatarioId: pratica.colaborador_id,
  });
  await enviarPushDaRevenda(revendaId, {
    modulo: "boas-praticas",
    titulo,
    mensagem,
    url,
    apenas: [pratica.colaborador_id],
  });

  atualizarTelas();
  voltar("sucesso", selecionada ? "Prática selecionada para a votação." : "Resposta enviada para quem sugeriu.");
}

/** Desfaz a avaliação -- só antes de a prática entrar numa votação. */
export async function voltarParaAnalise(formData: FormData) {
  await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Prática inválida.");

  const admin = createAdminClient();
  const { data: alteradas, error } = await admin
    .from("boas_praticas")
    .update({
      status: "em_analise",
      retorno: null,
      avaliado_por_id: null,
      avaliado_por_nome: null,
      avaliado_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("votacao_id", null)
    .in("status", ["selecionada", "nao_selecionada"])
    .select("id");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  if (!alteradas || alteradas.length === 0) {
    voltar("erro", "Prática que já entrou em votação não volta para análise.");
  }

  atualizarTelas();
  voltar("sucesso", "A prática voltou para análise.");
}

/**
 * Apagar -- para o teste e o engano. A prática que já entrou em votação
 * não se apaga: ela é parte do resultado que todo mundo viu.
 */
export async function excluirPraticaAdmin(formData: FormData) {
  await requireModulo("boas-praticas", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Prática inválida.");

  const admin = createAdminClient();
  const { data: apagadas, error } = await admin
    .from("boas_praticas")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("votacao_id", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível apagar: ${error.message}`);
  if (!apagadas || apagadas.length === 0) {
    voltar("erro", "Prática que já entrou em votação não pode ser apagada: ela faz parte do resultado.");
  }

  atualizarTelas();
  voltar("sucesso", "Prática apagada.");
}

/**
 * Abre a votação com as práticas escolhidas. Todas as regras de novo aqui,
 * independente do que a tela já barrou: pelo menos duas, todas
 * selecionadas e livres, prazo de hoje em diante, uma votação aberta por
 * vez (esta última também é índice único no banco).
 */
export async function abrirVotacao(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const premio = String(formData.get("premio") ?? "").trim().slice(0, LIMITES.premioMax) || null;
  const fim = String(formData.get("fim") ?? "").trim();
  const ids = [...new Set(formData.getAll("pratica_id").map(String).filter(Boolean))];

  if (titulo.length < 3 || titulo.length > LIMITES.votacaoTituloMax) {
    voltar("erro", `Dê um nome à votação (até ${LIMITES.votacaoTituloMax} caracteres).`);
  }
  if (!DATA.test(fim)) voltar("erro", "Informe até que dia a votação fica aberta.");
  if (fim < hojeSP()) voltar("erro", "O prazo da votação não pode estar no passado.");
  if (ids.length < LIMITES.minimoNaVotacao) {
    voltar("erro", `Escolha pelo menos ${LIMITES.minimoNaVotacao} práticas para a votação.`);
  }

  const admin = createAdminClient();

  const { data: jaAberta } = await admin
    .from("boas_praticas_votacoes")
    .select("id")
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .maybeSingle();
  if (jaAberta) voltar("erro", "Já existe uma votação aberta. Encerre ou cancele antes de abrir outra.");

  const { data: livres } = await admin
    .from("boas_praticas")
    .select("id")
    .in("id", ids)
    .eq("revenda_id", revendaId)
    .eq("status", "selecionada")
    .is("votacao_id", null);
  if ((livres ?? []).length !== ids.length) {
    voltar("erro", "Alguma prática escolhida não está mais disponível. Recarregue a tela e confira.");
  }

  const { data: votacao, error } = await admin
    .from("boas_praticas_votacoes")
    .insert({
      revenda_id: revendaId,
      titulo,
      premio,
      fim,
      aberta_por_id: perfil.id,
      aberta_por_nome: perfil.nome,
    })
    .select("id")
    .single();

  if (error || !votacao) {
    if (error?.code === "23505") {
      voltar("erro", "Já existe uma votação aberta. Encerre ou cancele antes de abrir outra.");
    }
    voltar("erro", `Não foi possível abrir a votação: ${error?.message ?? "tente de novo"}`);
  }

  const { data: vinculadas } = await admin
    .from("boas_praticas")
    .update({ votacao_id: votacao.id, atualizado_em: new Date().toISOString() })
    .in("id", ids)
    .eq("revenda_id", revendaId)
    .eq("status", "selecionada")
    .is("votacao_id", null)
    .select("id");

  // Outra pessoa mexeu numa delas no meio do caminho: desfaz tudo em vez
  // de abrir uma votação diferente da que foi montada na tela. Apagar a
  // votação solta as práticas sozinho (on delete set null).
  if ((vinculadas ?? []).length !== ids.length) {
    await admin.from("boas_praticas_votacoes").delete().eq("id", votacao.id);
    voltar("erro", "Alguma prática mudou enquanto a votação era aberta. Recarregue a tela e tente de novo.");
  }

  const tituloAviso = `🗳️ Votação aberta: ${titulo}`;
  const mensagem = `${ids.length} práticas concorrendo. Vote até ${formatarDia(fim)}${
    premio ? ` — prêmio: ${premio}` : ""
  }.`;
  const url = "/boas-praticas?aba=votar";

  await criarNotificacao({
    modulo: "boas-praticas",
    tipo: "importante",
    titulo: tituloAviso,
    mensagem,
    url,
    referenciaId: votacao.id,
    criadoPor: perfil.nome,
  });
  await enviarPushDaRevenda(revendaId, {
    modulo: "boas-praticas",
    titulo: tituloAviso,
    mensagem,
    url,
    exceto: perfil.id,
  });

  atualizarTelas();
  voltar("sucesso", "Votação aberta! A revenda inteira foi avisada.");
}

/** Prêmio e prazo mudam com a votação aberta -- o prêmio ainda está sendo definido. */
export async function atualizarVotacao(formData: FormData) {
  await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const premio = String(formData.get("premio") ?? "").trim().slice(0, LIMITES.premioMax) || null;
  const fim = String(formData.get("fim") ?? "").trim();

  if (!id) voltar("erro", "Votação inválida.");
  if (!DATA.test(fim)) voltar("erro", "Informe até que dia a votação fica aberta.");
  if (fim < hojeSP()) voltar("erro", "O prazo da votação não pode estar no passado.");

  const admin = createAdminClient();
  const { data: alteradas, error } = await admin
    .from("boas_praticas_votacoes")
    .update({ premio, fim })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  if (!alteradas || alteradas.length === 0) voltar("erro", "Esta votação já foi encerrada.");

  atualizarTelas();
  voltar("sucesso", "Votação atualizada.");
}

/**
 * Encerra e divulga. Quem ganha é o VOTO: a liderança só escolhe entre as
 * empatadas no primeiro lugar, e o servidor recusa qualquer outra.
 */
export async function encerrarVotacao(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const vencedoraId = String(formData.get("vencedora_id") ?? "");
  if (!id) voltar("erro", "Votação inválida.");

  const admin = createAdminClient();
  const { data: votacao } = await admin
    .from("boas_praticas_votacoes")
    .select("id, titulo, premio")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .maybeSingle();
  if (!votacao) voltar("erro", "Esta votação já foi encerrada.");

  // Uma revenda tem ~160 pessoas e é um voto por pessoa: cabe folgado
  // abaixo das 1.000 linhas que o PostgREST devolve por consulta.
  const [{ data: praticas }, { data: votos }] = await Promise.all([
    admin.from("boas_praticas").select("id, titulo, colaborador_id, colaborador_nome").eq("votacao_id", id),
    admin.from("boas_praticas_votos").select("pratica_id").eq("votacao_id", id),
  ]);
  const lista = praticas ?? [];
  const resultado = apurar(
    lista.map((p) => p.id as string),
    (votos ?? []) as { pratica_id: string }[],
  );

  if (resultado.total > 0 && !resultado.lideres.includes(vencedoraId)) {
    voltar("erro", "A vencedora tem de ser a mais votada (ou uma das empatadas em primeiro lugar).");
  }
  const vencedora = resultado.total > 0 ? lista.find((p) => p.id === vencedoraId) : undefined;

  const { data: encerradas, error } = await admin
    .from("boas_praticas_votacoes")
    .update({
      encerrada_em: new Date().toISOString(),
      encerrada_por_nome: perfil.nome,
      vencedora_id: vencedora?.id ?? null,
    })
    .eq("id", id)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível encerrar: ${error.message}`);
  if (!encerradas || encerradas.length === 0) voltar("erro", "Esta votação já foi encerrada.");

  if (vencedora) {
    const votosDela = resultado.contagem.get(vencedora.id) ?? 0;
    const titulo = `🏆 “${vencedora.titulo}” venceu a votação!`;
    const mensagem = `Prática de ${vencedora.colaborador_nome}, com ${votosDela} voto${
      votosDela === 1 ? "" : "s"
    }.${votacao.premio ? ` Prêmio: ${votacao.premio}.` : ""}`;
    const url = "/boas-praticas?aba=vencedoras";

    await criarNotificacao({
      modulo: "boas-praticas",
      tipo: "importante",
      titulo,
      mensagem,
      url,
      referenciaId: votacao.id,
      criadoPor: perfil.nome,
    });
    await enviarPushDaRevenda(revendaId, { modulo: "boas-praticas", titulo, mensagem, url });
  }

  atualizarTelas();
  voltar(
    "sucesso",
    vencedora ? "Votação encerrada e vencedora divulgada para a revenda." : "Votação encerrada sem votos.",
  );
}

/**
 * Cancelar a votação aberta -- para a votação montada errada. Os votos
 * vão junto, e as práticas voltam para "aguardando votação".
 */
export async function cancelarVotacao(formData: FormData) {
  await requireModulo("boas-praticas", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Votação inválida.");

  const admin = createAdminClient();
  const { data: apagadas, error } = await admin
    .from("boas_praticas_votacoes")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível cancelar: ${error.message}`);
  if (!apagadas || apagadas.length === 0) {
    voltar("erro", "Votação encerrada não se cancela: o resultado já foi divulgado.");
  }

  atualizarTelas();
  voltar("sucesso", "Votação cancelada. As práticas voltaram para aguardando votação.");
}
