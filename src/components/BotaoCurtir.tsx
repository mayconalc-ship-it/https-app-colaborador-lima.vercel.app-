"use client";

import { useState, useTransition } from "react";
import { alternarCurtida } from "@/app/comunicados/actions";

export function BotaoCurtir({
  comunicadoId,
  curtidoInicial,
  totalInicial,
}: {
  comunicadoId: number;
  curtidoInicial: boolean;
  totalInicial: number;
}) {
  const [curtido, setCurtido] = useState(curtidoInicial);
  const [total, setTotal] = useState(totalInicial);
  const [pendente, startTransition] = useTransition();

  function handleClick() {
    // Muda na hora e desfaz se o servidor recusar: no celular do motorista a
    // rede oscila, e esperar a resposta daria a impressao de travamento.
    const eraCurtido = curtido;
    setCurtido(!eraCurtido);
    setTotal((n) => (eraCurtido ? Math.max(0, n - 1) : n + 1));

    startTransition(async () => {
      const r = await alternarCurtida(comunicadoId, eraCurtido);
      if (!r.ok) {
        setCurtido(eraCurtido);
        setTotal((n) => (eraCurtido ? n + 1 : Math.max(0, n - 1)));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pendente}
      aria-pressed={curtido}
      aria-label={curtido ? "Remover curtida" : "Curtir"}
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
        curtido
          ? "border-red-200 bg-red-50 text-red-600"
          : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      <span className="text-base">{curtido ? "❤️" : "🤍"}</span>
      {total > 0 && <span>{total}</span>}
      <span className={total > 0 ? "sr-only" : ""}>Curtir</span>
    </button>
  );
}
