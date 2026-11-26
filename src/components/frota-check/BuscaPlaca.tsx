"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Busca de placa no painel (26/11/2026): com 38 caminhões, achar o que
 * está na frente da pessoa pelo pedaço da placa ("5B6", "ogl"). Esconde as
 * linhas da lista que não batem (as linhas têm data-placa); sem ir ao
 * servidor, então é instantâneo e funciona sem sinal.
 */
export function BuscaPlaca() {
  const [q, setQ] = useState("");

  function filtrar(v: string) {
    setQ(v);
    const alvo = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    document.querySelectorAll<HTMLElement>("[data-placa]").forEach((li) => {
      li.hidden = alvo !== "" && !(li.dataset.placa ?? "").includes(alvo);
    });
  }

  return (
    <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-primary">
      <Search className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        value={q}
        onChange={(e) => filtrar(e.target.value)}
        placeholder="Buscar placa (ex.: OGL5410)"
        inputMode="text"
        autoCapitalize="characters"
        className="min-w-0 flex-1 bg-transparent text-base uppercase outline-none placeholder:normal-case"
      />
      {q && (
        <button type="button" onClick={() => filtrar("")} aria-label="Limpar a busca" className="text-slate-400">
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}
