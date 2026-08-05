"use client";

import { useState } from "react";
import {
  CATEGORIAS_POR_TIME,
  NOMES_TIME,
  type TimeRanking,
} from "@/lib/ranking-categorias";

export function RankingForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [time, setTime] = useState<TimeRanking>("DU");
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <form
      action={action}
      className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Time
        </label>
        <div className="flex gap-2">
          {(Object.keys(CATEGORIAS_POR_TIME) as TimeRanking[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTime(t)}
              className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                time === t
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">{NOMES_TIME[time]}</p>
        <input type="hidden" name="time" value={time} />
      </div>

      <div>
        <label
          htmlFor="categoria"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Categoria de premiação
        </label>
        <select
          id="categoria"
          name="categoria"
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
          required
        >
          {CATEGORIAS_POR_TIME[time].map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="mes_ano"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Mês
        </label>
        <input
          id="mes_ano"
          name="mes_ano"
          type="month"
          defaultValue={mesAtual}
          required
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="arquivo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Foto do ganhador
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".png,.jpg,.jpeg"
          required
          className="w-full rounded-xl border border-slate-200 p-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
      >
        Enviar
      </button>
    </form>
  );
}
