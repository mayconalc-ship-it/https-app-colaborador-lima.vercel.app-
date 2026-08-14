"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NOTAS, OCORRENCIAS, notaRuim } from "@/lib/feedback-ocorrencias";
import { enviarFeedbackRota } from "./actions";

export default function FeedbackRotaPage() {
  const [nota, setNota] = useState<number | null>(null);
  const [rota, setRota] = useState("");
  const [comentario, setComentario] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

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
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const resultado = await enviarFeedbackRota(formData);
      if (resultado.ok) {
        setEnviado(true);
      } else {
        setErro(resultado.erro ?? "Não foi possível enviar.");
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

      <Link
        href="/feedback-rota/5-porques"
        className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
      >
        🧠 Analisar problema
      </Link>

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

        <button
          type="submit"
          disabled={
            nota === null ||
            rota === "" ||
            (notaRuim(nota) && comentario.trim() === "") ||
            pendente
          }
          aria-busy={pendente}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendente && <span className="rodinha" aria-hidden="true" />}
          {pendente
            ? "Enviando..."
            : nota === null
              ? "Escolha como foi sua rota"
              : rota === ""
                ? "Informe o nº do mapa"
                : notaRuim(nota) && comentario.trim() === ""
                  ? "Conte para nós o que podemos melhorar"
                  : "Enviar feedback"}
        </button>
      </form>
    </div>
  );
}
