"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
export function Pergunta({ questao }: { questao: QuestaoNaTela }) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [indo, comecarTransicao] = useTransition();

  const respondida = Boolean(feedback?.ok);
  const progresso = Math.round((questao.indice / questao.total) * 100);

  async function enviar() {
    if (escolha === null || enviando) return;
    setEnviando(true);
    const resposta = await responderQuestao({
      questaoId: questao.id,
      alternativaId: escolha,
    });
    setEnviando(false);
    setFeedback(resposta);
  }

  function avancar() {
    comecarTransicao(() => {
      if (feedback?.ultima) router.push("/desafio/resultado");
      // Sem push: a próxima pergunta vem da mesma rota, recalculada no
      // servidor. O refresh é o que traz a questão seguinte.
      else router.refresh();
    });
  }

  return (
    <div>
      {/* Progresso */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-lg font-bold text-slate-900">
            Pergunta {questao.indice} de {questao.total}
          </p>
          <p className="text-sm font-medium text-slate-500">{progresso}%</p>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={questao.indice}
          aria-valuemin={0}
          aria-valuemax={questao.total}
          aria-label={`Pergunta ${questao.indice} de ${questao.total}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-base font-semibold leading-snug text-slate-900">
          {questao.pergunta}
        </p>

        <div className="mt-4 space-y-2">
          {questao.alternativas.map((a, i) => {
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
