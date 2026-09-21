"use client";

import { useState } from "react";
import { LIMITES_QR, lerNotas, numeroDaNf } from "@/lib/qr-contingencia";

/**
 * AS NOTAS FISCAIS DO PAGAMENTO (pedido do dono, 21/09/2026): teclado
 * numérico e mais de uma NF. Digita o número e toca "+" (ou "Ir" no
 * teclado); cada nota vira uma etiqueta com ✕. O número digitado e não
 * adicionado entra sozinho quando o campo perde o foco -- tocar em Enviar
 * direto não perde a nota.
 */
export function CampoNotas({
  notas,
  aoMudar,
  desabilitado = false,
}: {
  notas: string[];
  aoMudar: (notas: string[]) => void;
  desabilitado?: boolean;
}) {
  const [rascunho, setRascunho] = useState("");
  const cheio = notas.length >= LIMITES_QR.notasMax;

  function adicionar() {
    if (!rascunho) return;
    aoMudar(lerNotas([...notas, rascunho]).slice(0, LIMITES_QR.notasMax));
    setRascunho("");
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
        Nota fiscal (NF)
        <span className="ml-1 font-normal normal-case text-slate-400">— uma ou mais</span>
      </span>
      {notas.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {notas.map((n) => (
            <li
              key={n}
              className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft py-1 pl-3 pr-1 text-sm font-semibold tabular-nums text-primary-dark"
            >
              NF {n}
              <button
                type="button"
                onClick={() => aoMudar(notas.filter((x) => x !== n))}
                disabled={desabilitado}
                aria-label={`Tirar a NF ${n}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-primary-dark hover:bg-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {!cheio && (
        <div className="flex gap-2">
          <input
            value={rascunho}
            onChange={(e) => setRascunho(numeroDaNf(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionar();
              }
            }}
            onBlur={adicionar}
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            placeholder={notas.length ? "Outra NF" : "Número da NF"}
            aria-label="Número da nota fiscal"
            disabled={desabilitado}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base tabular-nums text-slate-900 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            // onMouseDown: adiciona antes do blur do campo, sem piscar.
            onMouseDown={(e) => e.preventDefault()}
            onClick={adicionar}
            disabled={!rascunho || desabilitado}
            aria-label="Adicionar NF"
            className="shrink-0 rounded-xl border border-primary px-4 text-lg font-bold text-primary disabled:opacity-30"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
