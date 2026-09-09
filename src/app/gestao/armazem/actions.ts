"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo } from "@/lib/require-admin";

const ROTA = "/gestao/armazem";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Registra que a bombona do despejo foi esvaziada.
 *
 * A partir deste instante o termômetro conta do zero -- ver a migration
 * 110. Nada é apagado: os lançamentos continuam todos lá, o que muda é
 * de onde a soma da BOMBONA começa. O histórico de produtividade, o
 * ranking e os litros por turno seguem contando o período inteiro.
 *
 * `litros_no_momento` chega do formulário porque é o número que estava
 * na tela quando a pessoa clicou. Recalculá-lo aqui daria um valor
 * ligeiramente diferente (um lançamento pode entrar no meio), e o
 * histórico deve guardar o que ela viu ao decidir esvaziar.
 */
export async function esvaziarBombona(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) erro("Sessão expirada.");

  // A mesma régua que abre esta tela: quem lê os indicadores do armazém
  // é quem responde pela operação, e o esvaziamento é um ato de operação.
  if (!(await podeNoModulo("produtividade-armazem", "ver"))) {
    erro("Esvaziar a bombona é da liderança do armazém.");
  }

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const litros = Number(formData.get("litros_no_momento") ?? 0);

  const supabase = await createClient();
  const { error } = await supabase.from("pa_despejo_esvaziamentos").insert({
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    esvaziada_em: new Date().toISOString(),
    litros_no_momento: Number.isFinite(litros) && litros > 0 ? litros : 0,
  });

  if (error) erro("Não deu para registrar o esvaziamento. Tente de novo.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Bombona esvaziada — a contagem recomeça do zero.")}`);
}

/**
 * Desfaz o último esvaziamento.
 *
 * Existe para o engano de um clique: sem isso a bombona ficaria zerada
 * por engano até a próxima troca de verdade, e o número que a operação
 * usa para decidir quando descartar estaria errado o tempo todo.
 */
export async function desfazerEsvaziamento(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) erro("Sessão expirada.");
  if (!(await podeNoModulo("produtividade-armazem", "ver"))) {
    erro("Desfazer o esvaziamento é da liderança do armazém.");
  }

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Esvaziamento não encontrado.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pa_despejo_esvaziamentos")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) erro("Não deu para desfazer. Só quem registrou o esvaziamento pode desfazê-lo.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Esvaziamento desfeito.")}`);
}
