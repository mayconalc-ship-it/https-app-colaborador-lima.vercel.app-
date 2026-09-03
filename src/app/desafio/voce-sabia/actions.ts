"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";

/**
 * As duas únicas escritas do "Você sabia?".
 *
 * Nenhuma delas redireciona nem revalida rota: a lâmpada mora no layout,
 * em todas as telas, e um redirect aqui tiraria a pessoa de onde ela
 * estava só porque abriu um balão. O componente já sabe o próprio estado
 * -- ele mudou a tela antes de chamar.
 *
 * Quem é a pessoa vem SEMPRE da sessão, nunca do formulário. É o que
 * impede alguém de marcar card como visto (ou curtido) no nome de outro.
 */

/**
 * A pessoa abriu o balão.
 *
 * É este registro que gasta o card do dia e faz a lâmpada apagar até
 * amanhã. Marcar na ABERTURA, e não ao fechar, é deliberado: quem abriu
 * e saiu no meio já viu qual era a pergunta, e repeti-la amanhã seria
 * gastar o card com o que ela já leu.
 *
 * `ignoreDuplicates` porque reabrir o mesmo card no mesmo dia é normal --
 * e não pode mexer no `visto_em`, senão o card de hoje se renovaria a
 * cada toque e nunca daria lugar ao de amanhã.
 */
export async function marcarVista(questaoId: number) {
  const perfil = await getPerfil();
  const revendaId = await getRevendaId();
  if (!perfil || !revendaId) return;

  const admin = createAdminClient();
  await admin.from("voce_sabia_vistos").upsert(
    {
      colaborador_id: perfil.id,
      questao_id: questaoId,
      revenda_id: revendaId,
    },
    { onConflict: "colaborador_id,questao_id", ignoreDuplicates: true },
  );
}

/**
 * Curtir e descurtir -- o único retorno que a pessoa dá aqui.
 *
 * Não vale ponto e não entra em ranking nenhum, de propósito: no minuto
 * em que curtir valer ponto, ele deixa de dizer "isto me ensinou" e passa
 * a dizer "vi que dava ponto". O que ele serve é para a liderança saber
 * quais explicações pegaram -- e essas são as que valem virar treinamento
 * de verdade.
 *
 * Faz upsert em vez de update porque dá para curtir um card no mesmo
 * toque que o abre, e a corrida entre as duas escritas deixaria o curtir
 * sem linha para atualizar.
 */
export async function alternarCurtida(questaoId: number, curtir: boolean) {
  const perfil = await getPerfil();
  const revendaId = await getRevendaId();
  if (!perfil || !revendaId) return;

  const admin = createAdminClient();
  await admin.from("voce_sabia_vistos").upsert(
    {
      colaborador_id: perfil.id,
      questao_id: questaoId,
      revenda_id: revendaId,
      curtiu: curtir,
      curtido_em: curtir ? new Date().toISOString() : null,
    },
    { onConflict: "colaborador_id,questao_id" },
  );
}
