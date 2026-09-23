"use client";

import { useState } from "react";

/**
 * O link da votação para o grupo de WhatsApp (23/09/2026).
 *
 * O endereço é montado no navegador (window.location.origin): o servidor
 * não sabe por qual domínio a pessoa entrou, e um link com o domínio
 * errado não abre no celular de ninguém.
 */
export function LinkDaVotacao({ token, titulo, prazo }: { token: string; titulo: string; prazo: string }) {
  const [copiado, setCopiado] = useState<"link" | "recado" | null>(null);
  const url = typeof window === "undefined" ? `/votar/${token}` : `${window.location.origin}/votar/${token}`;
  const recado = `💡 *Boas Práticas — ${titulo}*\n\nLeia as ideias dos colegas e vote na que você achar melhor. É um voto por pessoa, e leva menos de um minuto.\n\n${prazo}\n\n👉 ${url}`;

  async function copiar(texto: string, qual: "link" | "recado") {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Link para o grupo</p>
      <p className="break-all rounded-lg border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-700">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copiar(url, "link")}
          className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          {copiado === "link" ? "✅ Link copiado" : "🔗 Copiar o link"}
        </button>
        <button
          type="button"
          onClick={() => copiar(recado, "recado")}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {copiado === "recado" ? "✅ Recado copiado" : "💬 Copiar o recado pronto"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(recado)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Abrir no WhatsApp
        </a>
      </div>
      <p className="text-[11px] text-emerald-900">
        Quem abrir o link escreve o nome e os 3 primeiros números do CPF, e vota uma vez. Quem já votou pelo app não
        vota de novo.
      </p>
    </div>
  );
}
