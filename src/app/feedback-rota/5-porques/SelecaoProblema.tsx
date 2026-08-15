"use client";

import { useState, useTransition } from "react";
import { PROBLEMAS } from "@/lib/cinco-porques-problemas";
import { iniciarAnalise } from "./actions";
import type { ArvoreDecisao } from "@/lib/cinco-porques-ia";

/**
 * Grade de chips, igual à de OCORRENCIAS em feedback-rota/page.tsx. "Outro"
 * é o único item que revela um campo de texto -- em todo o resto do fluxo
 * o motorista só toca em botões.
 */
export function SelecaoProblema({
  feedbackRotaId,
  rota,
  onIniciar,
}: {
  feedbackRotaId: number;
  rota: string | null;
  onIniciar: (dados: {
    analiseId: number;
    problemaLabel: string;
    arvore: ArvoreDecisao;
  }) => void;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [textoOutro, setTextoOutro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const ehOutro = selecionado === "outro";
  const labelEscolhido = ehOutro
    ? textoOutro.trim()
    : (PROBLEMAS.find((p) => p.id === selecionado)?.label ?? "");

  function confirmar() {
    if (!selecionado) return;
    if (ehOutro && !textoOutro.trim()) {
      setErro("Descreva rapidamente o que aconteceu.");
      return;
    }
    setErro(null);

    iniciarTransicao(async () => {
      const resultado = await iniciarAnalise({
        problemaId: selecionado,
        problemaLabel: labelEscolhido,
        feedbackRotaId,
        rota: rota ?? undefined,
      });
      if (resultado.ok) {
        onIniciar({
          analiseId: resultado.analiseId,
          problemaLabel: labelEscolhido,
          arvore: resultado.arvore,
        });
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-800">
        O que aconteceu na rota?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PROBLEMAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelecionado(p.id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center text-sm transition ${
              selecionado === p.id
                ? "border-primary bg-primary-soft font-semibold text-primary"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="text-2xl">{p.emoji}</span>
            {p.label}
          </button>
        ))}
      </div>

      {ehOutro && (
        <input
          autoFocus
          value={textoOutro}
          onChange={(e) => setTextoOutro(e.target.value)}
          maxLength={120}
          placeholder="Descreva em poucas palavras..."
          className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      )}

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={confirmar}
        disabled={!selecionado || pendente || (ehOutro && !textoOutro.trim())}
        aria-busy={pendente}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente && <span className="rodinha" aria-hidden="true" />}
        {pendente ? "Preparando..." : "Continuar"}
      </button>
      {pendente && (
        <p className="mt-2 text-center text-xs text-slate-400">
          Pode levar até 1 minuto.
        </p>
      )}
    </div>
  );
}
