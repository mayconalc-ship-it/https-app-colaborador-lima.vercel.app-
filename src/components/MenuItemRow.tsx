"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import type { ItemMenu } from "@/lib/menu";

export function MenuItemRow({
  item,
  primeiro,
  ultimo,
  onMover,
  onAlternar,
  onRenomear,
}: {
  item: ItemMenu;
  primeiro: boolean;
  ultimo: boolean;
  onMover: (formData: FormData) => void;
  onAlternar: (formData: FormData) => void;
  onRenomear: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <form action={onRenomear} className="space-y-3 bg-slate-50 p-4">
        <input type="hidden" name="chave" value={item.chave} />
        <div className="flex gap-2">
          <div className="w-20">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Ícone
            </label>
            <input
              name="emoji"
              defaultValue={item.emoji}
              maxLength={4}
              className="w-full rounded-lg border border-slate-200 p-2 text-center text-lg focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Nome
            </label>
            <input
              name="titulo"
              defaultValue={item.titulo}
              required
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <BotaoEnviar
            textoEnviando="Salvando..."
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Salvar
          </BotaoEnviar>
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
      className={`flex items-center gap-2 p-3 ${item.visivel ? "" : "bg-slate-50"}`}
    >
      <span className="text-xl">{item.emoji}</span>
      <span
        className={`flex-1 text-sm font-medium ${
          item.visivel ? "text-slate-800" : "text-slate-400 line-through"
        }`}
      >
        {item.titulo}
      </span>

      <form action={onMover}>
        <input type="hidden" name="chave" value={item.chave} />
        <input type="hidden" name="direcao" value="cima" />
        <BotaoEnviar
          compacto
          disabled={primeiro}
          ariaLabel="Mover para cima"
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          ↑
        </BotaoEnviar>
      </form>

      <form action={onMover}>
        <input type="hidden" name="chave" value={item.chave} />
        <input type="hidden" name="direcao" value="baixo" />
        <BotaoEnviar
          compacto
          disabled={ultimo}
          ariaLabel="Mover para baixo"
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          ↓
        </BotaoEnviar>
      </form>

      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Editar
      </button>

      <form action={onAlternar}>
        <input type="hidden" name="chave" value={item.chave} />
        <input type="hidden" name="visivel" value={String(item.visivel)} />
        <BotaoEnviar
          compacto
          className={`rounded-lg border px-2 py-1 text-xs font-medium ${
            item.visivel
              ? "border-slate-200 text-slate-600 hover:bg-slate-50"
              : "border-primary text-primary hover:bg-primary-soft"
          }`}
        >
          {item.visivel ? "Ocultar" : "Mostrar"}
        </BotaoEnviar>
      </form>
    </div>
  );
}
