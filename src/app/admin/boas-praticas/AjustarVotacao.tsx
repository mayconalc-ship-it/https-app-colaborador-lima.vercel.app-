"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { lerReais, validarDatasDaVotacao, validarPremios } from "@/lib/boas-praticas";
import { atualizarVotacao } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Prazo, divulgação e prêmios da votação aberta -- um Salvar só, com as regras do servidor. */
export function AjustarVotacao({
  id,
  hoje,
  fim: fimInicial,
  divulgacao: divulgacaoInicial,
  premios: premiosIniciais,
}: {
  id: string;
  hoje: string;
  fim: string;
  divulgacao: string;
  premios: [string, string, string];
}) {
  const [fim, setFim] = useState(fimInicial);
  const [divulgacao, setDivulgacao] = useState(divulgacaoInicial);
  const [premios, setPremios] = useState(premiosIniciais);

  const erro =
    validarDatasDaVotacao(fim || null, divulgacao || null, hoje) ??
    validarPremios({
      premio_1: lerReais(premios[0]),
      premio_2: lerReais(premios[1]),
      premio_3: lerReais(premios[2]),
    });

  return (
    <form action={atualizarVotacao} className="space-y-3 border-t border-slate-100 p-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="fim-atual">Votação aberta até (inclusive)</label>
          <input
            id="fim-atual"
            name="fim"
            type="date"
            required
            min={hoje}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="divulgacao-atual">Divulgação do resultado</label>
          <input
            id="divulgacao-atual"
            name="divulgacao_em"
            type="date"
            required
            min={fim || hoje}
            value={divulgacao}
            onChange={(e) => setDivulgacao(e.target.value)}
            className={campo}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["🥇 1º lugar (R$)", "🥈 2º lugar (R$)", "🥉 3º lugar (R$)"].map((r, i) => (
          <div key={r}>
            <label className={rotulo} htmlFor={`premio-atual-${i + 1}`}>{r}</label>
            <input
              id={`premio-atual-${i + 1}`}
              name={`premio_${i + 1}`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={premios[i]}
              onChange={(e) =>
                setPremios((atual) => {
                  const novo = [...atual] as [string, string, string];
                  novo[i] = e.target.value;
                  return novo;
                })
              }
              className={campo}
            />
          </div>
        ))}
      </div>
      {erro && <p className="text-xs font-semibold text-amber-700">{erro}</p>}
      <BotaoEnviar
        disabled={Boolean(erro)}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Salvar
      </BotaoEnviar>
    </form>
  );
}
