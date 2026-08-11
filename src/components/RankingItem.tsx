"use client";

import { useState } from "react";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import {
  CATEGORIAS_POR_TIME,
  type TimeRanking,
} from "@/lib/ranking-categorias";

type Registro = {
  id: number;
  mes_ano: string;
  time: string;
  categoria: string;
  imagem_url: string;
};

function formatarMes(mesAno: string) {
  const [ano, mes] = mesAno.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function RankingItem({
  registro,
  onAtualizar,
  onExcluir,
}: {
  registro: Registro;
  onAtualizar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();
  const [time, setTime] = useState<TimeRanking>(registro.time as TimeRanking);

  if (editando) {
    return (
      <form action={onAtualizar} className="space-y-3 bg-slate-50 p-4">
        <input type="hidden" name="id" value={registro.id} />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Time
          </label>
          <div className="flex gap-2">
            {(Object.keys(CATEGORIAS_POR_TIME) as TimeRanking[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                  time === t
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input type="hidden" name="time" value={time} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Categoria
          </label>
          <select
            name="categoria"
            defaultValue={
              (CATEGORIAS_POR_TIME[time] as readonly string[]).includes(
                registro.categoria,
              )
                ? registro.categoria
                : CATEGORIAS_POR_TIME[time][0]
            }
            className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
          >
            {CATEGORIAS_POR_TIME[time].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Mês
          </label>
          <input
            type="month"
            name="mes_ano"
            defaultValue={registro.mes_ano}
            required
            className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
          />
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
        <p className="text-xs text-slate-400">
          Para trocar a foto, envie novamente pelo formulário acima com o mesmo
          mês, time e categoria.
        </p>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={registro.imagem_url}
        alt={registro.categoria}
        className="h-14 w-14 rounded-lg object-cover"
      />
      <div className="flex-1 text-sm">
        <p className="font-medium text-slate-800">{registro.categoria}</p>
        <p className="text-xs text-slate-400">
          {registro.time} · {formatarMes(registro.mes_ano)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Editar
      </button>
      <form
        action={onExcluir}
        onSubmit={aoExcluir({
          titulo: `Excluir a foto de "${registro.categoria}"?`,
          detalhe: formatarMes(registro.mes_ano),
        })}
      >
        <input type="hidden" name="id" value={registro.id} />
        <button
          type="submit"
          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Excluir
        </button>
      </form>
    </div>
  );
}
