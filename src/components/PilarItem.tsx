"use client";

import { useState } from "react";
import type { PilarCadastrado } from "@/lib/pilares";

export function PilarItem({
  pilar,
  quantidadeArquivos,
  primeiro,
  ultimo,
  onRenomear,
  onMover,
  onAlternar,
  onExcluir,
}: {
  pilar: PilarCadastrado;
  quantidadeArquivos: number;
  primeiro: boolean;
  ultimo: boolean;
  onRenomear: (formData: FormData) => void;
  onMover: (formData: FormData) => void;
  onAlternar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <form action={onRenomear} className="space-y-3 bg-slate-50 p-4">
        <input type="hidden" name="id" value={pilar.id} />
        <input type="hidden" name="nome_antigo" value={pilar.nome} />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Nome do pilar
          </label>
          <input
            name="nome"
            defaultValue={pilar.nome}
            required
            className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
          />
          {quantidadeArquivos > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Os {quantidadeArquivos} arquivo(s) deste pilar acompanham o novo
              nome automaticamente.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 p-3 ${pilar.visivel ? "" : "bg-slate-50"}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            pilar.visivel ? "text-slate-800" : "text-slate-400 line-through"
          }`}
        >
          {pilar.nome}
        </p>
        <p className="text-xs text-slate-400">
          {quantidadeArquivos} arquivo(s)
          {pilar.visivel ? "" : " · oculto para o colaborador"}
        </p>
      </div>

      <form action={onMover}>
        <input type="hidden" name="id" value={pilar.id} />
        <input type="hidden" name="direcao" value="cima" />
        <button
          type="submit"
          disabled={primeiro}
          aria-label="Mover para cima"
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          ↑
        </button>
      </form>

      <form action={onMover}>
        <input type="hidden" name="id" value={pilar.id} />
        <input type="hidden" name="direcao" value="baixo" />
        <button
          type="submit"
          disabled={ultimo}
          aria-label="Mover para baixo"
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          ↓
        </button>
      </form>

      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Editar
      </button>

      <form action={onAlternar}>
        <input type="hidden" name="id" value={pilar.id} />
        <input type="hidden" name="visivel" value={String(pilar.visivel)} />
        <button
          type="submit"
          className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
            pilar.visivel
              ? "border-slate-200 text-slate-600 hover:bg-slate-50"
              : "border-primary text-primary hover:bg-primary-soft"
          }`}
        >
          {pilar.visivel ? "Ocultar" : "Mostrar"}
        </button>
      </form>

      <form
        action={onExcluir}
        onSubmit={(e) => {
          if (!confirm(`Excluir o pilar "${pilar.nome}"?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={pilar.id} />
        <input type="hidden" name="nome" value={pilar.nome} />
        <button
          type="submit"
          className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Excluir
        </button>
      </form>
    </div>
  );
}
