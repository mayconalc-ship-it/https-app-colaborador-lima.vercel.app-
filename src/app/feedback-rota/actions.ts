"use server";

import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { notaRuim, notaExigeTratativa, OCORRENCIAS } from "@/lib/feedback-ocorrencias";

const IDS_VALIDOS = new Set(OCORRENCIAS.map((o) => o.id as string));

export type ResultadoFeedback =
  | { ok: true; feedbackId: number }
  | { ok: false; erro: string };

export async function enviarFeedbackRota(
  formData: FormData,
): Promise<ResultadoFeedback> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };
  if (!(await temAcessoModulo("feedbacks"))) {
    return { ok: false, erro: "Você não tem acesso a este módulo." };
  }

  const nota = Number(formData.get("nota"));
  if (!Number.isInteger(nota) || nota < 0 || nota > 3) {
    return { ok: false, erro: "Escolha como foi sua rota." };
  }

  // Obrigatório: sem o nº do mapa não dá para rastrear de qual rota veio o relato.
  const rota = ((formData.get("rota") as string) || "").replace(/\D/g, "");
  if (!rota) return { ok: false, erro: "Informe o nº do mapa (rota)." };

  const comentario =
    ((formData.get("comentario") as string) || "").trim() || null;

  // Não confiar só na tela: quem monta a requisição na mão também precisa
  // passar por aqui, senão uma nota ruim sem explicação furaria o front.
  if (notaRuim(nota) && !comentario) {
    return { ok: false, erro: "Conte para nós o que podemos melhorar." };
  }

  const ocorrencias = formData
    .getAll("ocorrencias")
    .map(String)
    .filter((id) => IDS_VALIDOS.has(id));

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return { ok: false, erro: "Você não está em nenhuma revenda." };
  }

  const { data: gravado, error } = await supabase
    .from("feedback_rota")
    .insert({
      revenda_id: revendaId,
      colaborador_id: user.id,
      nota,
      rota,
      ocorrencias,
      comentario,
      // Só "Regular" entra na fila de tratativa da liderança em
      // /admin/feedbacks -- "Ruim" tem seu próprio caminho (5 Porquês) e
      // "Boa"/"Ótima" não precisam de resposta nenhuma.
      tratativa_status: notaExigeTratativa(nota) ? "pendente" : null,
    })
    .select("id")
    .single();

  if (error || !gravado) {
    return { ok: false, erro: "Não foi possível enviar. Tente de novo." };
  }

  return { ok: true, feedbackId: gravado.id };
}

/**
 * O colaborador marca se aceita ou não o retorno que a liderança escreveu
 * sobre o feedback "Regular". Espelha responderTratativa() do 5 Porquês
 * (src/app/feedback-rota/5-porques/actions.ts) -- é só a opinião do
 * colaborador, não mexe em tratativa_status, que é território do admin.
 */
export async function responderTratativaFeedback(dados: {
  feedbackId: number;
  aceitou: boolean;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const { error } = await supabase
    .from("feedback_rota")
    .update({
      colaborador_aceitou: dados.aceitou,
      colaborador_aceitou_em: new Date().toISOString(),
    })
    .eq("id", dados.feedbackId)
    .eq("colaborador_id", user.id);

  if (error) return { ok: false, erro: "Não foi possível registrar sua resposta." };
  return { ok: true };
}
