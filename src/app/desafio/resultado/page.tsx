import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  getClassificacaoRodada,
  getContexto,
  getParticipacao,
  getRevisao,
  getRodadaAtual,
  getUltimaRodada,
} from "@/lib/quiz-server";
import {
  PONTOS_POR_QUESTAO,
  aproveitamento,
  formatarTempo,
  medalha,
} from "@/lib/quiz";

/**
 * O fim do desafio: quanto fez, como foi cada pergunta e onde ficou.
 *
 * Serve para dois momentos — o de quem acabou de concluir e o de quem
 * volta depois para rever as explicações. É a mesma tela porque é a mesma
 * informação; repetir isso em duas telas só criaria duas versões para
 * manter.
 */
export default async function ResultadoPage() {
  const ctx = await getContexto();
  if (!ctx?.area) redirect("/desafio");

  // A rodada atual é o caso comum. Se ela já fechou, mostramos a última —
  // senão quem concluiu no dia 31 perderia o próprio resultado no dia 1º.
  const rodada =
    (await getRodadaAtual(ctx.revendaId, ctx.area)) ??
    (await getUltimaRodada(ctx.revendaId, ctx.area));

  if (!rodada) redirect("/desafio");

  const participacao = await getParticipacao(rodada.id, ctx.perfil.id);
  if (!participacao) redirect("/desafio");

  const [revisao, classificacao] = await Promise.all([
    getRevisao(participacao.id),
    getClassificacaoRodada(rodada),
  ]);

  const posicao =
    classificacao.find((l) => l.colaboradorId === ctx.perfil.id)?.posicao ?? null;

  const total = rodada.totalPerguntas;
  const percentual = aproveitamento(participacao.acertos, total);

  return (
    <div>
      <PageHeader title="Desafio concluído!" subtitle={rodada.nome} fecharHref="/desafio" />

      {participacao.status !== "concluida" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Este desafio ainda está em andamento para você. O que aparece abaixo
          é o que já foi respondido.
        </p>
      )}

      <div className="rounded-2xl border border-gold bg-white p-6 text-center shadow-sm">
        <p className="text-5xl">🎉</p>
        <p className="mt-3 text-5xl font-bold text-primary">
          {participacao.pontos}
          <span className="text-2xl text-slate-400">
            /{total * PONTOS_POR_QUESTAO}
          </span>
        </p>
        <p className="mt-1 text-sm font-medium text-slate-500">pontos</p>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
          <Numero
            valor={`${participacao.acertos}/${total}`}
            rotulo="acertos"
          />
          <Numero valor={`${percentual}%`} rotulo="aproveitamento" />
          <Numero valor={formatarTempo(participacao.tempoMs)} rotulo="tempo" />
        </div>

        {posicao && (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold-soft px-5 py-2 text-base font-bold text-primary-dark">
            {medalha(posicao) ?? "🎽"} {posicao}º lugar
            <span className="text-xs font-medium text-slate-500">
              de {classificacao.length}
            </span>
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          O tempo não vale ponto — ele só desempata quem fez a mesma
          pontuação.
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link
          href="/desafio/classificacao"
          className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white hover:bg-primary-dark"
        >
          🏆 Ver classificação
        </Link>
        <Link
          href="/desafio/meu-campeonato"
          className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-primary ring-1 ring-slate-200 hover:bg-slate-50"
        >
          📈 Meu Campeonato
        </Link>
      </div>

      <h2 className="mb-2 mt-6 font-semibold text-slate-700">
        Suas respostas
      </h2>
      <div className="space-y-2">
        {revisao.map((item, i) => (
          <div
            key={item.questaoId}
            className={`rounded-2xl border p-4 ${
              item.correta
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">
              {item.correta ? "✅" : "❌"} {i + 1}. {item.pergunta}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              <span className="text-slate-500">Você respondeu:</span>{" "}
              {item.minhaResposta ?? "—"}
            </p>
            {!item.correta && (
              <p className="text-sm text-slate-700">
                <span className="text-slate-500">Resposta certa:</span>{" "}
                {item.respostaCerta ?? "—"}
              </p>
            )}
            {item.explicacao && (
              <p className="mt-2 rounded-lg bg-white/70 p-3 text-sm leading-relaxed text-slate-600">
                {item.explicacao}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}
