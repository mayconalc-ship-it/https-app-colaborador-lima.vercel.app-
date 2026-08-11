"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  FORMATOS,
  STATUSES,
  TIPOS,
  hojeISO,
  totalEmCaixas,
  type Contagem,
  type Fatores,
  type Formato,
} from "@/lib/ativo-giro";
import { editarContagem, registrarContagem } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

function Salvar({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <span className="rodinha" aria-hidden="true" />}
      {pending
        ? "Salvando..."
        : editando
          ? "Salvar alterações"
          : "Registrar contagem"}
    </button>
  );
}

/**
 * Serve para lançar e para corrigir.
 *
 * Ganhou o modo de edição quando o colaborador passou a poder arrumar a
 * própria contagem: o banco já permitia (a RLS libera a própria linha) e
 * a ação `editarContagem` já existia -- faltava só a tela. Manter um
 * formulário só evita que o de correção fique para trás quando um campo
 * novo aparecer.
 */
export function FormContagem({
  fatores,
  contagem,
  aoCancelar,
}: {
  fatores: Fatores;
  contagem?: Contagem;
  aoCancelar?: () => void;
}) {
  const editando = Boolean(contagem);
  const [formato, setFormato] = useState<Formato>(
    (contagem?.formato as Formato) ?? "600ml",
  );
  const [palete, setPalete] = useState(
    contagem ? String(contagem.palete) : "",
  );
  const [lastro, setLastro] = useState(
    contagem ? String(contagem.lastro) : "",
  );
  const [caixa, setCaixa] = useState(contagem ? String(contagem.caixa) : "");

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
      action={editando ? editarContagem : registrarContagem}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      {contagem && <input type="hidden" name="id" value={contagem.id} />}

      <div>
        <label className={rotulo} htmlFor="data">
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          defaultValue={contagem?.data ?? hojeISO()}
          className={campo}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo} htmlFor="tipo">
            Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            className={campo}
            defaultValue={contagem?.tipo ?? "Kit AG"}
          >
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
          defaultValue={contagem?.status ?? "Cheio"}
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

      <Salvar editando={editando} />

      {aoCancelar && (
        <button
          type="button"
          onClick={aoCancelar}
          className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}
