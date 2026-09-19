"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { conferirComprovantes } from "@/app/qr-contingencia/actions";

/**
 * O "conferido" do financeiro: num comprovante (variante "item") ou em
 * todos os que faltam de um mapa (variante "mapa"). Tocar num já conferido
 * desfaz, com confirmação.
 */
export function BotaoConferir({
  ids,
  conferido,
  variante,
  titulo,
}: {
  ids: string[];
  conferido: boolean;
  variante: "item" | "mapa";
  titulo?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar() {
    if (conferido && !confirm("Desfazer a conferência deste comprovante?")) return;
    setErro(null);
    iniciar(async () => {
      const r = await conferirComprovantes(ids, !conferido);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });
  }

  const classe =
    variante === "mapa"
      ? "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      : conferido
        ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
        : "rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50";

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button type="button" onClick={alternar} disabled={pendente} title={titulo} className={classe}>
        {pendente
          ? "..."
          : variante === "mapa"
            ? `✅ Conferir ${ids.length === 1 ? "o que falta" : `os ${ids.length} que faltam`}`
            : conferido
              ? "✅ Conferido"
              : "Conferir"}
      </button>
      {erro && <span className="max-w-[14rem] text-right text-[11px] text-red-600">{erro}</span>}
    </span>
  );
}

/** Copia o resumo do mapa (para colar no WhatsApp ou na planilha do financeiro). */
export function CopiarResumo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-primary"
    >
      {copiado ? "✅ Resumo copiado" : "📋 Copiar resumo"}
    </button>
  );
}
