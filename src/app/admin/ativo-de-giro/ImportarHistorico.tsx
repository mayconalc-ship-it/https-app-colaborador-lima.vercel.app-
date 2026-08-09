"use client";

import { useRef, useState } from "react";
import { importarHistorico } from "@/app/ativo-de-giro/actions";

/**
 * Traz o historico que ficou salvo no navegador do app antigo.
 * O arquivo e o JSON gerado pelo exportador (ver README do pacote).
 */
export function ImportarHistorico() {
  const [json, setJson] = useState("");
  const [nome, setNome] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setNome(arquivo.name);
    setJson(await arquivo.text());
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-bold uppercase text-slate-500">
        Importar histórico do app antigo
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Envie o arquivo <code>contagens-ag.json</code> exportado do aplicativo
        antigo. Cada contagem mantém o nome de quem contou.
      </p>

      <form action={importarHistorico} className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          onChange={aoEscolher}
          className="block w-full text-sm text-slate-600"
        />
        <input type="hidden" name="json" value={json} />
        {nome && (
          <p className="text-xs text-slate-500">Arquivo escolhido: {nome}</p>
        )}
        <button
          type="submit"
          disabled={!json}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Importar
        </button>
      </form>
    </div>
  );
}
