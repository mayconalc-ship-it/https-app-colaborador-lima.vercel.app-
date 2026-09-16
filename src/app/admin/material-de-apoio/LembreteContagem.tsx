"use client";

import { useState } from "react";
import { HORAS_DO_LEMBRETE } from "@/lib/material-apoio";
import { Destinatarios } from "./Destinatarios";
import { salvarLembreteDeContagem } from "./actions";

type Pessoa = { id: string; nome: string; cargo: string | null };

/**
 * O lembrete diário de contar: liga/desliga, horário e quem recebe, num
 * Salvar só. Ligado sem ninguém marcado, o botão trava -- o servidor
 * confere a mesma coisa.
 */
export function LembreteContagem({
  pessoas,
  ativo: ativoInicial,
  hora,
  marcados,
}: {
  pessoas: Pessoa[];
  ativo: boolean;
  hora: number;
  marcados: string[];
}) {
  const [ativo, setAtivo] = useState(ativoInicial);

  return (
    <Destinatarios
      pessoas={pessoas}
      marcados={marcados}
      acao={salvarLembreteDeContagem}
      rotuloDoBotao="Salvar o lembrete"
      exigirAlguem={ativo ? "Com o lembrete ligado, marque pelo menos uma pessoa." : null}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            name="ativo"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-5 w-5"
          />
          Lembrar todos os dias
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          às
          <select
            name="hora"
            defaultValue={hora}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900 focus:border-primary focus:outline-none"
          >
            {HORAS_DO_LEMBRETE.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
    </Destinatarios>
  );
}
