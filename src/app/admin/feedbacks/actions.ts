"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";

const ROTA = "/admin/feedbacks";

function erro(mensagem: string): never {
  redirect(`${ROTA}?aba=5-porques&erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Grava a tratativa da liderança sobre uma análise de 5 Porquês: status
 * (pendente/concluída) e uma resposta curta para o motorista. Território
 * exclusivo do admin -- o motorista nunca escreve nestas colunas, só lê o
 * que a liderança respondeu (quando essa tela existir para ele).
 */
export async function salvarTratativa(formData: FormData) {
  await requireModulo("feedbacks", "editar");
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
