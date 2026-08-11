"use client";

import { useState } from "react";
import { ComunicadoForm } from "@/components/ComunicadoForm";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { editoria, formatarDataCurta } from "@/lib/comunicados";

type Comunicado = {
  id: number;
  titulo: string;
  resumo: string | null;
  texto: string;
  categoria: string;
  destaque: boolean;
  data: string;
  imagem_url: string | null;
};

export function ComunicadoItem({
  comunicado,
  onSalvar,
  onExcluir,
}: {
  comunicado: Comunicado;
  onSalvar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();
  const ed = editoria(comunicado.categoria);

  if (editando) {
    return (
      <div className="bg-slate-50 p-4">
        <ComunicadoForm
          action={onSalvar}
          comunicado={comunicado}
          aoCancelar={() => setEditando(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3">
      {comunicado.imagem_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comunicado.imagem_url}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ed.cor}`}>
            {ed.emoji} {ed.rotulo}
          </span>
          {comunicado.destaque && (
            <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">
              capa
            </span>
          )}
          <span className="text-xs text-slate-400">
            {formatarDataCurta(comunicado.data)}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-800">{comunicado.titulo}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Editar
        </button>
        <form
          action={onExcluir}
          onSubmit={aoExcluir({
            titulo: `Excluir "${comunicado.titulo}"?`,
            detalhe: "O comunicado sai do mural para todo mundo.",
          })}
        >
          <input type="hidden" name="id" value={comunicado.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Excluir
          </button>
        </form>
      </div>
    </div>
  );
}
