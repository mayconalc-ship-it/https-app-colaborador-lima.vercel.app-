"use client";

import { csvDasContagens, resumoWhatsApp, type Contagem, type Fatores } from "@/lib/ativo-giro";

/**
 * Duas saidas, de proposito: colar no WhatsApp e abrir no Excel.
 * A copia leva o cabecalho junto, para a mensagem chegar formatada.
 */
export function ExportarContagens({
  contagens,
  fatores,
  data,
}: {
  contagens: Contagem[];
  fatores: Fatores;
  data: string;
}) {
  if (contagens.length === 0) return null;

  const texto = resumoWhatsApp(data, contagens, fatores);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      alert("Resumo copiado! É só colar no WhatsApp.");
    } catch {
      window.prompt("Copie o texto abaixo:", texto);
    }
  }

  async function compartilhar() {
    if (navigator.share) {
      await navigator.share({ text: texto });
    } else {
      await copiar();
    }
  }

  function baixarCsv() {
    const csv = csvDasContagens(contagens, fatores);
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contagem-ag-${data}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={copiar}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Copiar resumo
      </button>
      <button
        type="button"
        onClick={compartilhar}
        className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
      >
        Compartilhar
      </button>
      <button
        type="button"
        onClick={baixarCsv}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
      >
        Baixar CSV
      </button>
    </div>
  );
}
