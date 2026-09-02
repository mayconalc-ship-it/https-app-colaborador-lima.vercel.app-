"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";

const ROTA = "/gestao/feedbacks";

function erro(mensagem: string): never {
  redirect(`${ROTA}?aba=5-porques&erro=${encodeURIComponent(mensagem)}`);
}

function erroFeedback(mensagem: string): never {
  redirect(`${ROTA}?aba=feedbacks&erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Grava a tratativa da liderança sobre uma análise de 5 Porquês: status
 * (pendente/concluída) e uma resposta curta para o motorista. Território
 * exclusivo do admin -- o motorista nunca escreve nestas colunas, só lê o
 * que a liderança respondeu (quando essa tela existir para ele).
 */
export async function salvarTratativa(formData: FormData) {
  await requireModulo("feedbacks", "editar", "/gestao");
  const perfil = await getPerfil();
  const revendaId = await exigirRevenda(ROTA);

  const analiseId = Number(formData.get("analise_id"));
  if (!Number.isInteger(analiseId)) erro("Análise inválida.");

  const status = String(formData.get("tratativa_status") ?? "");
  if (!["pendente", "concluida"].includes(status)) erro("Status inválido.");

  const resposta = String(formData.get("resposta_lideranca") ?? "")
    .trim()
    .slice(0, 1000);

  const admin = createAdminClient();

  // Confere que a análise é desta revenda antes de gravar -- trava contra
  // um id de outra revenda vindo manipulado no formulário.
  const { data: analise } = await admin
    .from("cinco_porques_analises")
    .select("colaborador_id")
    .eq("id", analiseId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!analise) erro("Análise não encontrada.");

  const { error } = await admin
    .from("cinco_porques_analises")
    .update({
      tratativa_status: status,
      resposta_lideranca: resposta || null,
      resposta_lideranca_em: new Date().toISOString(),
      resposta_lideranca_por: perfil?.id ?? null,
      resposta_lideranca_nome: resposta ? (perfil?.nome ?? null) : null,
    })
    .eq("id", analiseId)
    .eq("revenda_id", revendaId);

  if (error) erro("Não foi possível salvar a tratativa.");

  // Avisa o motorista só quando há de fato uma resposta -- marcar "tratado"
  // sem escrever nada não merece notificação. Módulo próprio ("cinco-porques",
  // não "feedback") para não herdar o botão "Responder agora" do lembrete de
  // feedback -- aqui o motorista só vê a resposta e aceita ou não, não digita
  // nada. O link leva direto para a análise, não para a lista genérica.
  if (resposta) {
    const titulo = "Seu 5 Porquês recebeu resposta";
    const url = `/feedback-rota/5-porques/${analiseId}`;
    await criarNotificacao({
      modulo: "cinco-porques",
      tipo: "importante",
      titulo,
      mensagem: resposta,
      url,
      referenciaId: analiseId,
      criadoPor: perfil?.id,
      destinatarioId: analise.colaborador_id,
      revendaId,
    });
    await enviarPushDaRevenda(revendaId, {
      modulo: "cinco-porques",
      titulo,
      mensagem: resposta,
      url,
      apenas: [analise.colaborador_id],
    });
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=5-porques&sucesso=${encodeURIComponent("Tratativa salva.")}`);
}

/**
 * Grava a tratativa da liderança sobre um feedback "Regular": mesma ideia
 * de salvarTratativa() acima, só que direto na linha do feedback_rota,
 * não numa análise de 5 Porquês -- "Regular" nunca passa pelo fluxo de
 * causa raiz, mas ainda assim precisa de resposta da liderança.
 */
export async function salvarTratativaFeedback(formData: FormData) {
  await requireModulo("feedbacks", "editar", "/gestao");
  const perfil = await getPerfil();
  const revendaId = await exigirRevenda(ROTA);

  const feedbackId = Number(formData.get("feedback_id"));
  if (!Number.isInteger(feedbackId)) erroFeedback("Feedback inválido.");

  const status = String(formData.get("tratativa_status") ?? "");
  if (!["pendente", "concluida"].includes(status)) erroFeedback("Status inválido.");

  const resposta = String(formData.get("resposta_lideranca") ?? "")
    .trim()
    .slice(0, 1000);

  const admin = createAdminClient();

  // Confere que o feedback é desta revenda e realmente "Regular" antes de
  // gravar -- trava contra um id de outra revenda ou nota vindo
  // manipulado no formulário.
  const { data: feedback } = await admin
    .from("feedback_rota")
    .select("colaborador_id, nota")
    .eq("id", feedbackId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!feedback || feedback.nota !== 1) erroFeedback("Feedback não encontrado.");

  const { error } = await admin
    .from("feedback_rota")
    .update({
      tratativa_status: status,
      resposta_lideranca: resposta || null,
      resposta_lideranca_em: new Date().toISOString(),
      resposta_lideranca_por: perfil?.id ?? null,
      resposta_lideranca_nome: resposta ? (perfil?.nome ?? null) : null,
    })
    .eq("id", feedbackId)
    .eq("revenda_id", revendaId);

  if (error) erroFeedback("Não foi possível salvar a tratativa.");

  // Mesmo comportamento do 5 Porquês: só notifica quando há resposta de
  // verdade, e com módulo próprio para o botão certo ("Ver resposta", não
  // "Responder agora" do lembrete diário de feedback).
  if (resposta) {
    const titulo = "Seu feedback recebeu resposta";
    const url = `/feedback-rota/${feedbackId}`;
    await criarNotificacao({
      modulo: "feedback-tratativa",
      tipo: "importante",
      titulo,
      mensagem: resposta,
      url,
      referenciaId: feedbackId,
      criadoPor: perfil?.id,
      destinatarioId: feedback.colaborador_id,
      revendaId,
    });
    await enviarPushDaRevenda(revendaId, {
      modulo: "feedback-tratativa",
      titulo,
      mensagem: resposta,
      url,
      apenas: [feedback.colaborador_id],
    });
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=feedbacks&sucesso=${encodeURIComponent("Tratativa salva.")}`);
}
