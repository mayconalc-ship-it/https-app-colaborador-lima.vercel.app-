"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  FORMATOS,
  STATUSES,
  TIPOS,
  hojeISO,
  totalEmCaixas,
  type Fatores,
  type Formato,
} from "@/lib/ativo-giro";
import { registrarContagem } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? "Salvando..." : "Registrar contagem"}
    </button>
  );
}

export function FormContagem({ fatores }: { fatores: Fatores }) {
  const [formato, setFormato] = useState<Formato>("600ml");
  const [palete, setPalete] = useState("");
  const [lastro, setLastro] = useState("");
  const [caixa, setCaixa] = useState("");

  const fator = fatores[formato];
  const total = totalEmCaixas(
    {
      palete: Number(palete || 0),
      lastro: Number(lastro || 0),
      caixa: Number(caixa || 0),
    },
    fator,
  );

  return (
    <form
      action={registrarContagem}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div>
        <label className={rotulo} htmlFor="data">
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          defaultValue={hojeISO()}
          className={campo}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo} htmlFor="tipo">
            Tipo
          </label>
          <select id="tipo" name="tipo" className={campo} defaultValue="Kit AG">
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="formato">
            Formato
          </label>
          <select
            id="formato"
            name="formato"
            className={campo}
            value={formato}
            onChange={(e) => setFormato(e.target.value as Formato)}
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={rotulo} htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          className={campo}
          defaultValue="Cheio"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={rotulo} htmlFor="palete">
            Paletes
          </label>
          <input
            id="palete"
            name="palete"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            value={palete}
            onChange={(e) => setPalete(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="lastro">
            Lastros
          </label>
          <input
            id="lastro"
            name="lastro"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            value={lastro}
            onChange={(e) => setLastro(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa">
            Caixas
          </label>
          <input
            id="caixa"
            name="caixa"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            value={caixa}
            onChange={(e) => setCaixa(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        Fator {formato}: 1 palete = {fator.palete} cx · 1 lastro ={" "}
        {fator.lastro} cx
        <span className="mt-1 block text-lg font-bold text-slate-900">
          Total: {total} caixas
        </span>
      </p>

      <Salvar />
    </form>
  );
}
