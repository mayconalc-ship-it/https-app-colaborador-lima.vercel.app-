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
  if (participacao.status === "concluida") redirect("/desafio/resultado");

  const questao = await getQuestaoAtual(participacao.id, rodada);
  // Sem próxima pergunta e ainda "em andamento" acontece quando o Admin
  // tira uma questão da rodada no meio do caminho. O resultado sabe lidar
  // com isso; ficar aqui deixaria a pessoa presa numa tela vazia.
  if (!questao) redirect("/desafio/resultado");

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {rodada.nome}
      </p>
      <Pergunta questao={questao} />
    </div>
  );
}
