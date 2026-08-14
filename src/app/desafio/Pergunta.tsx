"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { letra } from "@/lib/quiz";
import type { QuestaoNaTela } from "@/lib/quiz-server";
import { responderQuestao, type Feedback } from "./actions";

/**
 * Uma pergunta por vez, com resposta e explicação na mesma tela.
 *
 * O ponto do desenho está no feedback imediato: o objetivo declarado é a
 * pessoa APRENDER com o erro, e não descobrir a nota no fim. Por isso a
 * explicação aparece aqui, colada na pergunta que ela acabou de errar --
 * é o único momento em que ela ainda lembra por que escolheu aquilo.
 *
 * Enquanto o feedback está na tela, as alternativas ficam travadas: a
 * resposta já foi gravada no servidor e mudar a seleção sugeriria o
 * contrário.
 */
export function Pergunta({ questao }: { questao: QuestaoNaTela | null }) {
  const router = useRouter();
  // A pergunta que está na TELA -- que não é necessariamente a que o
  // servidor acabou de mandar.
  //
  // Chamar uma ação de servidor faz o Next buscar de novo os dados da rota
  // sozinho, sem ninguém pedir. Como /desafio/jogar sempre devolve "a
  // próxima não respondida", no instante em que a resposta é gravada a
  // pergunta seguinte já chega aqui pelas props -- e, sem esta cópia, a
  // tela trocava as alternativas enquanto a pessoa ainda lia o "você
  // errou" da anterior.
  const [atual, setAtual] = useState(questao);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avancando, setAvancando] = useState(false);
  const [indo, comecarTransicao] = useTransition();

  // Ajuste de estado durante a renderização, que é o jeito que o React
  // recomenda para acompanhar uma prop que mudou. Em efeito isto renderiza
  // duas vezes e a pergunta pisca; aqui o React descarta a primeira
  // renderização antes de pintar qualquer coisa.
  if (avancando && questao && questao.id !== atual?.id) {
    setAtual(questao);
    setEscolha(null);
    setFeedback(null);
    setAvancando(false);
  }

  // Sem pergunta na tela e sem pergunta vindo do servidor: o desafio já
  // estava concluído quando esta tela abriu. Quem acabou de concluir NÃO
  // cai aqui -- para essa pessoa `atual` ainda guarda a última pergunta, e
  // é isso que mantém a explicação no lugar.
  if (!atual) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">🎉</p>
        <p className="mt-2 font-semibold text-slate-800">
          Você já concluiu este desafio
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Cada pessoa tem uma tentativa por rodada.
        </p>
        <Link
          href="/desafio/resultado"
          className="mt-4 inline-block rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Ver meu resultado
        </Link>
      </div>
    );
  }

  const respondida = Boolean(feedback?.ok);
  const progresso = Math.round((atual.indice / atual.total) * 100);
  // Copiado para fora do `enviar`: dentro da função o TypeScript não
  // consegue mais garantir que `atual` continua preenchido.
  const questaoId = atual.id;

  async function enviar() {
    if (escolha === null || enviando) return;
    setEnviando(true);
    const resposta = await responderQuestao({
      questaoId,
      alternativaId: escolha,
    });
    setEnviando(false);
    setFeedback(resposta);
  }

  function avancar() {
    if (feedback?.ultima) {
      comecarTransicao(() => router.push("/desafio/resultado"));
      return;
    }

    setAvancando(true);
    // Quase sempre a próxima já chegou (ver o comentário do `atual`) e o
    // ajuste acima resolve na mesma hora. O refresh cobre o caso em que a
    // busca automática ainda está a caminho -- sem ele, o botão não teria
    // o que esperar.
    comecarTransicao(() => router.refresh());
  }

  return (
    <div>
      {/* Progresso */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-lg font-bold text-slate-900">
            Pergunta {atual.indice} de {atual.total}
          </p>
          <p className="text-sm font-medium text-slate-500">{progresso}%</p>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={atual.indice}
          aria-valuemin={0}
          aria-valuemax={atual.total}
          aria-label={`Pergunta ${atual.indice} de ${atual.total}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-base font-semibold leading-snug text-slate-900">
          {atual.pergunta}
        </p>

        <div className="mt-4 space-y-2">
          {atual.alternativas.map((a, i) => {
            const marcada = escolha === a.id;
            return (
              <label
                key={a.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                  marcada
                    ? "border-primary bg-primary-soft"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${respondida ? "cursor-default opacity-90" : ""}`}
              >
                <input
                  type="radio"
                  name="alternativa"
                  value={a.id}
                  checked={marcada}
                  disabled={respondida || enviando}
                  onChange={() => setEscolha(a.id)}
                  className="sr-only"
                />
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    marcada
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {letra(i)}
                </span>
                <span className="flex-1 leading-snug text-slate-800">
                  {a.texto}
                </span>
              </label>
            );
          })}
        </div>

        {!respondida && (
          <>
            {feedback?.erro && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {feedback.erro}
              </p>
            )}
            <button
              type="button"
              onClick={enviar}
              disabled={escolha === null || enviando}
              aria-busy={enviando}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="rodinha" aria-hidden="true" />
                  Conferindo...
                </span>
              ) : (
                "Responder"
              )}
            </button>
          </>
        )}
      </div>

      {respondida && feedback && (
        <div
          className={`mt-3 rounded-2xl border p-5 ${
            feedback.correta
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }`}
          role="status"
        >
          <p
            className={`text-base font-bold ${
              feedback.correta ? "text-emerald-800" : "text-rose-800"
            }`}
          >
            {feedback.correta ? "✅ Resposta correta!" : "❌ Resposta incorreta."}
          </p>

          {!feedback.correta && feedback.respostaCerta && (
            <p className="mt-2 text-sm text-rose-900">
              <span className="font-semibold">O certo era:</span>{" "}
              {feedback.respostaCerta}
            </p>
          )}

          {feedback.explicacao && (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {feedback.explicacao}
            </p>
          )}

          <button
            type="button"
            onClick={avancar}
            disabled={indo}
            aria-busy={indo}
            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {indo ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="rodinha" aria-hidden="true" />
                Abrindo...
              </span>
            ) : feedback.ultima ? (
              "Ver meu resultado 🎉"
            ) : (
              "Próxima pergunta →"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
