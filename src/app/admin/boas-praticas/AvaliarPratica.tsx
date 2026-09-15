"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LIMITES } from "@/lib/boas-praticas";
import { avaliarPratica } from "./actions";

/**
 * Selecionar ou não, com a resposta para quem sugeriu.
 *
 * "Não selecionar" fica desligado até haver resposta escrita -- a mesma
 * regra que a ação confere e que a migration trava. Recusar em silêncio é
 * o jeito mais rápido de a pessoa nunca mais sugerir.
 */
export function AvaliarPratica({ id }: { id: string }) {
  const [retorno, setRetorno] = useState("");

  return (
    <form action={avaliarPratica} className="space-y-2 rounded-xl bg-slate-50 p-3">
      <input type="hidden" name="id" value={id} />
      <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor={`retorno-${id}`}>
        Resposta para quem sugeriu{" "}
        <span className="normal-case text-slate-400">(obrigatória para não selecionar)</span>
      </label>
      <textarea
        id={`retorno-${id}`}
        name="retorno"
        rows={2}
        maxLength={LIMITES.retornoMax}
        value={retorno}
        onChange={(e) => setRetorno(e.target.value)}
        placeholder="Ex: Boa ideia! Já existe algo parecido no padrão da rota; que tal adaptar para o armazém?"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
      />
      <Botoes semRetorno={retorno.trim().length === 0} />
    </form>
  );
}

function Botoes({ semRetorno }: { semRetorno: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="submit"
        name="decisao"
        value="selecionada"
        disabled={pending}
        className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Salvando..." : "✅ Selecionar para votação"}
      </button>
      <button
        type="submit"
        name="decisao"
        value="nao_selecionada"
        disabled={pending || semRetorno}
        title={semRetorno ? "Escreva a resposta para quem sugeriu" : undefined}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Não selecionar
      </button>
    </div>
  );
}
