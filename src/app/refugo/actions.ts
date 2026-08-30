"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";

const ROTA = "/refugo";

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
 * A explicação do colaborador para uma aferição que deu refugo.
 *
 * É por AFERIÇÃO, não por dia: cada aferição é de um item e de um mapa, e
 * o que aconteceu com uma garrafa quebrada não explica um faltante do
 * outro item. No Rating vale a mesma lógica; na Devolução é por dia
 * porque lá a meta é do dia.
 *
 * NÃO existe corte por meta aqui, ao contrário da Devolução. Refugo é
 * raro -- das 434 aferições do ano, 115 tiveram algum refugo, com mediana
 * de 0,19%. Uma meta de 1% liberaria o campo 4 vezes no ano inteiro para
 * a operação toda. O gatilho é ter refugo; a régua de "destoante" que já
 * existe serve para destacar, não para calar quem quer explicar.
 */
export async function justificarRefugo(formData: FormData) {
  const perfil = await requireAcessoModulo("refugo", ROTA);

  const opcional = (n: string) => String(formData.get(n) ?? "").trim() || undefined;
  const filtro = { de: opcional("de"), ate: opcional("ate"), dia: opcional("dia") };

  const revendaId = await getRevendaId();
  if (!revendaId) voltar(filtro, "erro", "Você não está em nenhuma revenda.");

  const afericaoId = String(formData.get("afericao_id") ?? "").trim();
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 1000);
  if (!afericaoId) voltar(filtro, "erro", "Aferição inválida.");
  if (!texto) voltar(filtro, "erro", "Escreva o que aconteceu antes de enviar.");

  const supabase = await createClient();

  // O RLS só entrega a aferição se ela for da pessoa (motorista, ajudante
  // ou conferente). Reconferir no servidor importa: um formulário
  // reenviado depois de uma reimportação gravaria explicação em aferição
  // que já mudou de dono ou deixou de ter refugo.
  const { data: afericao } = await supabase
    .from("refugo_afericoes")
    .select("id, qt_faltante, qt_qualidade, motorista_colaborador_id, conferente_colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("id", afericaoId)
    .maybeSingle();

  if (!afericao) voltar(filtro, "erro", "Esta aferição não é sua ou não existe mais.");

  const refugo = Number(afericao.qt_faltante) + Number(afericao.qt_qualidade);
  if (refugo <= 0) {
    voltar(filtro, "erro", "Esta aferição não teve refugo — não há o que explicar.");
  }

  const papel =
    afericao.motorista_colaborador_id === perfil.id
      ? "motorista"
      : afericao.conferente_colaborador_id === perfil.id
        ? "conferente"
        : "ajudante";

  const { error } = await supabase.from("refugo_justificativas").upsert(
    {
      revenda_id: revendaId,
      afericao_id: afericaoId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      papel,
      texto,
      criado_em: new Date().toISOString(),
    },
    { onConflict: "afericao_id,colaborador_id" },
  );

  if (error) voltar(filtro, "erro", `Não foi possível enviar: ${error.message}`);

  revalidatePath(ROTA);
  voltar(filtro, "sucesso", "Explicação enviada. Obrigado!");
}
