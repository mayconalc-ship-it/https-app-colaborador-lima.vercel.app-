"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { precisaFeedback } from "@/lib/rating";

const ROTA = "/rating";

function erro(mensagem: string, dia?: string): never {
  const d = dia ? `dia=${dia}&` : "";
  redirect(`${ROTA}?${d}erro=${encodeURIComponent(mensagem)}`);
}

/**
 * A versão de quem entregou, para uma avaliação abaixo de 5 estrelas.
 *
 * A checagem de que a avaliação é MINHA não fica só no RLS: o RLS
 * garante que ninguém leia a avaliação do colega, mas quem responde
 * precisa também saber em que papel respondeu (motorista ou ajudante),
 * e isso só a linha diz.
 */
export async function responderAvaliacao(formData: FormData) {
  const perfil = await requireAcessoModulo("rating", ROTA);
  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const avaliacaoId = String(formData.get("avaliacao_id") ?? "");
  const dia = String(formData.get("dia") ?? "") || undefined;
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 1000);

  if (!avaliacaoId) erro("Avaliação inválida.", dia);
  if (!texto) erro("Escreva o que aconteceu antes de enviar.", dia);

  const supabase = await createClient();

  const { data: avaliacao } = await supabase
    .from("rating_avaliacoes")
    .select("id, nota, motorista_colaborador_id, ajudante1_colaborador_id, ajudante2_colaborador_id")
    .eq("id", avaliacaoId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!avaliacao) erro("Esta avaliação não é sua ou não existe mais.", dia);

  // 5 estrelas não pede explicação -- deixar responder aqui abriria uma
  // porta para escrever em cima de entrega que ninguém questionou.
  if (!precisaFeedback(avaliacao.nota)) {
    erro("Esta entrega foi avaliada com 5 estrelas, não precisa de resposta.", dia);
  }

  const papel =
    avaliacao.motorista_colaborador_id === perfil.id ? "motorista" : "ajudante";

  const { error } = await supabase.from("rating_feedbacks").upsert(
    {
      revenda_id: revendaId,
      avaliacao_id: avaliacaoId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      papel,
      texto,
      criado_em: new Date().toISOString(),
    },
    { onConflict: "avaliacao_id,colaborador_id" },
  );

  if (error) erro(`Não foi possível enviar: ${error.message}`, dia);

  revalidatePath(ROTA);
  redirect(`${ROTA}?${dia ? `dia=${dia}&` : ""}sucesso=${encodeURIComponent("Resposta enviada. Obrigado!")}`);
}
