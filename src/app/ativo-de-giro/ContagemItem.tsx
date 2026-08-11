"use client";

import { useState } from "react";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import {
  formatarData,
  totalEmCaixas,
  type Contagem,
  type Fatores,
} from "@/lib/ativo-giro";
import { FormContagem } from "./FormContagem";
import { excluirContagem } from "./actions";

/**
 * Uma contagem na lista "Minhas contagens", com corrigir e apagar.
 *
 * O colaborador sempre pôde editar e excluir a própria linha -- a RLS de
 * `ag_contagens` libera exatamente isso, e a ação `editarContagem` já
 * tratava o caso. O que faltava era o botão: quem contava errado tinha
 * que apagar e lançar de novo, ou pedir para a liderança arrumar.
 *
 * A exclusão agora pergunta antes. Um toque errado num item da lista
 * apagava a contagem na hora, e refazer no fim do turno custa caro.
 */
export function ContagemItem({
  contagem,
  fatores,
}: {
  contagem: Contagem;
  fatores: Fatores;
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();

  if (editando) {
    return (
      <li className="rounded-xl border border-primary bg-primary-soft/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-primary-dark">
          Corrigindo a contagem
        </p>
        <FormContagem
          fatores={fatores}
          contagem={contagem}
          aoCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      {/* Duas faixas em vez de uma. Com "cx", Editar e Excluir na mesma
          linha do texto, um celular de 360px espremia os tres botoes ate
          o texto virar duas letras por linha. Os botoes descem para uma
          faixa propria, com altura de alvo decente para o polegar. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {contagem.tipo} · {contagem.formato} · {contagem.status}
          </p>
          <p className="text-xs text-slate-500">
            {formatarData(contagem.data)} — Pal {contagem.palete} / Las{" "}
            {contagem.lastro} / Cx {contagem.caixa}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
          {totalEmCaixas(contagem, fatores[contagem.formato])} cx
        </span>
      </div>

      <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          ✏️ Editar
        </button>
        <form
          action={excluirContagem}
          onSubmit={aoExcluir({
            titulo: "Excluir esta contagem?",
            detalhe: `${contagem.tipo} · ${contagem.formato} · ${contagem.status} — ${formatarData(contagem.data)}`,
          })}
        >
          <input type="hidden" name="id" value={contagem.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            🗑️ Excluir
          </button>
        </form>
      </div>
    </li>
  );
}
