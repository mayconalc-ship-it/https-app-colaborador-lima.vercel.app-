"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  NOTAS,
  OCORRENCIAS,
  notaRuim,
  notaExigeCincoPorques,
} from "@/lib/feedback-ocorrencias";
import { enviarFeedbackRota } from "./actions";

export default function FeedbackRotaPage() {
  const router = useRouter();
  const [nota, setNota] = useState<number | null>(null);
  const [rota, setRota] = useState("");
  const [comentario, setComentario] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // O botão "Fazer 5 Porquês" só aparece quando o formulário já está
  // pronto para envio -- mesma regra que hoje libera o botão único.
  const pronto =
    nota !== null && rota !== "" && !(notaRuim(nota) && comentario.trim() === "");
  const ehRuim = nota !== null && notaExigeCincoPorques(nota);

  function alternarOcorrencia(id: string) {
    setMarcadas((atuais) =>
      atuais.includes(id)
        ? atuais.filter((item) => item !== id)
        : [...atuais, id],
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    // O segundo argumento (submitter) é obrigatório para o FormData
    // incluir o "name=acao" do BOTÃO que disparou o envio -- sem ele o
    // FormData nunca sabe qual dos dois botões foi tocado.
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(e.currentTarget, submitter);
    const irPara5Porques = formData.get("acao") === "5porques";

    startTransition(async () => {
      const resultado = await enviarFeedbackRota(formData);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      if (irPara5Porques) {
        router.push(`/feedback-rota/5-porques?feedbackId=${resultado.feedbackId}`);
      } else {
        setEnviado(true);
      }
    });
  }

  if (enviado) {
    return (
      <div>
        <PageHeader title="Feedback da Rota" />
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-semibold text-green-800">Feedback enviado!</p>
          <p className="mt-1 text-sm text-green-700">
            Obrigado. Isso ajuda a gente a resolver os problemas da rota.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Voltar ao menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Feedback da Rota"
        subtitle="Leva menos de 1 minuto. Se a rota foi ruim, conte o que houve"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-800">
            1. Como foi sua rota hoje?
          </p>
          <div className="flex gap-2">
            {NOTAS.map((item) => (
              <button
                type="button"
                key={item.valor}
                onClick={() => setNota(item.valor)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border py-3 transition ${
                  nota === item.valor
                    ? "border-primary bg-primary-soft"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="text-xs font-medium text-slate-600">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
          {nota !== null && <input type="hidden" name="nota" value={nota} />}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label
            htmlFor="rota"
            className="mb-1 block text-sm font-semibold text-slate-800"
          >
            2. Nº do mapa (rota)
          </label>
          <p className="mb-3 text-xs text-slate-400">
            É por ele que a gente localiza a rota depois.
          </p>
          <input
            id="rota"
            name="rota"
            required
            inputMode="numeric"
            autoComplete="off"
            value={rota}
            // Só dígitos: o número do mapa vem impresso e é sempre numérico.
            onChange={(e) => setRota(e.target.value.replace(/\D/g, ""))}
            placeholder="Ex: 1234"
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">
            3. Aconteceu alguma dessas situações?
          </p>
          <p className="mb-3 text-xs text-slate-400">
            Toque no que aconteceu. Pode marcar mais de um — ou nenhum.
          </p>
          <div className="flex flex-wrap gap-2">
            {OCORRENCIAS.map((item) => {
              const ativa = marcadas.includes(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={ativa}
                  onClick={() => alternarOcorrencia(item.id)}
                  className={`rounded-full border px-3 py-2 text-sm transition ${
                    ativa
                      ? "border-primary bg-primary-soft font-semibold text-primary"
                      : "border-slate-200 text-slate-700"
                  }`}
                >
                  {item.emoji} {item.label}
                </button>
              );
            })}
          </div>
          {marcadas.map((id) => (
            <input key={id} type="hidden" name="ocorrencias" value={id} />
          ))}
        </div>

        <div
          className={`rounded-2xl border bg-white p-4 shadow-sm ${
            nota !== null && notaRuim(nota)
              ? "border-amber-300"
              : "border-slate-200"
          }`}
        >
          <label
            htmlFor="comentario"
            className="mb-1 block text-sm font-semibold text-slate-800"
          >
            4.{" "}
            {nota !== null && notaRuim(nota)
              ? "O que aconteceu? Como podemos melhorar?"
              : "Quer detalhar?"}{" "}
            <span className="font-normal text-slate-400">
              {nota !== null && notaRuim(nota) ? "(obrigatório)" : "(opcional)"}
            </span>
          </label>
          <textarea
            id="comentario"
            name="comentario"
            rows={3}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Onde foi, qual cliente, o que precisou fazer..."
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </p>
        )}

        {pronto ? (
          <div className="space-y-2">
            {ehRuim && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-800">
                  🧠 Essa rota foi Ruim — vamos até a causa raiz?
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Quando a rota é Ruim, o 5 Porquês é obrigatório antes de
                  enviar. Leva só mais um minuto e é o que mais ajuda a
                  gente a resolver de verdade.
                </p>
              </div>
            )}

            {!ehRuim && (
              <button
                type="submit"
                name="acao"
                value="enviar"
                disabled={pendente}
                aria-busy={pendente}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendente && <span className="rodinha" aria-hidden="true" />}
                {pendente ? "Enviando..." : "✅ Enviar feedback"}
              </button>
            )}

            <button
              type="submit"
              name="acao"
              value="5porques"
              disabled={pendente}
              aria-busy={pendente}
              className="flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-primary bg-primary-soft py-3 font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                {pendente
                  ? "Enviando..."
                  : ehRuim
                    ? "🧠 Fazer 5 Porquês (obrigatório)"
                    : "🧠 Fazer 5 Porquês"}
              </span>
              {!pendente && (
                <span className="text-xs font-normal text-primary/80">
                  Encontre a causa raiz do problema
                </span>
              )}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nota === null
              ? "Escolha como foi sua rota"
              : rota === ""
                ? "Informe o nº do mapa"
                : "Conte para nós o que podemos melhorar"}
          </button>
        )}
      </form>
    </div>
  );
}
