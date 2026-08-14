import { redirect } from "next/navigation";
import {
  getContexto,
  getParticipacao,
  getQuestaoAtual,
  getRodadaAtual,
} from "@/lib/quiz-server";
import { Pergunta } from "../Pergunta";

/**
 * A tela do quiz.
 *
 * Renderizada no servidor a cada pergunta, de propósito: assim o
 * navegador nunca recebe a lista inteira de questões (nem o gabarito
 * junto). Ele recebe uma pergunta, suas alternativas e mais nada.
 */
export default async function JogarPage() {
  const ctx = await getContexto();
  if (!ctx?.area) redirect("/desafio");

  const rodada = await getRodadaAtual(ctx.revendaId, ctx.area);
  if (!rodada) redirect("/desafio");

  const participacao = await getParticipacao(rodada.id, ctx.perfil.id);
  if (!participacao) redirect("/desafio");

  // "Já concluiu" também NÃO redireciona daqui, pelo mesmo motivo da nota
  // abaixo: responder a última pergunta é exatamente o que muda o status
  // para concluída, e o redirect cairia em cima de quem está lendo a
  // explicação. Quem chegar nesta tela com o desafio já encerrado recebe
  // do próprio componente um caminho para o resultado.

  const questao = await getQuestaoAtual(participacao.id, rodada);

  // Acabaram as perguntas -- e aqui NÃO se redireciona.
  //
  // Responder é uma ação de servidor, e toda ação de servidor faz o Next
  // buscar os dados desta rota de novo, sozinho. Na última pergunta essa
  // busca acontece no exato momento em que a explicação aparece na tela:
  // um redirect aqui arrancaria a pessoa da tela antes de ela ler por que
  // errou -- justamente o que esta funcionalidade existe para ensinar.
  //
  // Passando `null`, o componente continua montado, mantém na tela a
  // pergunta que ele já estava mostrando, e o botão "Ver meu resultado"
  // leva adiante no tempo de quem está lendo.

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {rodada.nome}
      </p>
      <Pergunta questao={questao} />
    </div>
  );
}
