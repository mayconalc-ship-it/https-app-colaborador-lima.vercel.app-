"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { precisaFeedback } from "@/lib/rating";

const ROTA = "/rating";

/** Volta para a MESMA tela que a pessoa estava vendo -- perder o filtro
 *  de período depois de responder daria a impressão de que a resposta
 *  sumiu junto com a avaliação. */
function voltar(
  filtro: { de?: string; ate?: string; dia?: string },
  chave: "erro" | "sucesso",
  mensagem: string,
): never {
  const p = new URLSearchParams();
  if (filtro.de) p.set("de", filtro.de);
  if (filtro.ate) p.set("ate", filtro.ate);
  if (filtro.dia) p.set("dia", filtro.dia);
  p.set(chave, mensagem);
  redirect(`${ROTA}?${p.toString()}`);
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

  const texto1 = (n: string) => String(formData.get(n) ?? "").trim() || undefined;
  const filtro = { de: texto1("de"), ate: texto1("ate"), dia: texto1("dia") };

  const revendaId = await getRevendaId();
  if (!revendaId) voltar(filtro, "erro", "Você não está em nenhuma revenda.");

  const avaliacaoId = String(formData.get("avaliacao_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 1000);

  if (!avaliacaoId) voltar(filtro, "erro", "Avaliação inválida.");
  if (!texto) voltar(filtro, "erro", "Escreva o que aconteceu antes de enviar.");

  const supabase = await createClient();

  const { data: avaliacao } = await supabase
    .from("rating_avaliacoes")
    .select("id, nota, motorista_colaborador_id, ajudante1_colaborador_id, ajudante2_colaborador_id")
    .eq("id", avaliacaoId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!avaliacao) voltar(filtro, "erro", "Esta avaliação não é sua ou não existe mais.");

  // 5 estrelas não pede explicação -- deixar responder aqui abriria uma
  // porta para escrever em cima de entrega que ninguém questionou.
  if (!precisaFeedback(avaliacao.nota)) {
    voltar(filtro, "erro", "Esta entrega foi avaliada com 5 estrelas, não precisa de resposta.");
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

  if (error) voltar(filtro, "erro", `Não foi possível enviar: ${error.message}`);

  revalidatePath(ROTA);
  voltar(filtro, "sucesso", "Resposta enviada. Obrigado!");
}
