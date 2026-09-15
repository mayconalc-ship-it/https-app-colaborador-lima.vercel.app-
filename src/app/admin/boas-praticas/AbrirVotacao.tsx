"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { LIMITES, formatarReais, premiosDe, validarDatasDaVotacao, type Premios } from "@/lib/boas-praticas";
import { abrirVotacao } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Monta a votação com as aprovadas. O botão só liga com o mínimo de
 * práticas marcadas e com as datas em ordem -- as mesmas regras que
 * `abrirVotacao` confere no servidor. Prazo e divulgação vêm preenchidos
 * com o calendário da Configuração.
 */
export function AbrirVotacao({
  praticas,
  nomeSugerido,
  hoje,
  fimPadrao,
  divulgacaoPadrao,
  premios,
}: {
  praticas: { id: string; titulo: string; autor: string }[];
  nomeSugerido: string;
  hoje: string;
  fimPadrao: string;
  divulgacaoPadrao: string;
  premios: Premios;
}) {
  const [marcadas, setMarcadas] = useState(() => new Set(praticas.map((p) => p.id)));
  const [fim, setFim] = useState(fimPadrao);
  const [divulgacao, setDivulgacao] = useState(divulgacaoPadrao);
  const faltam = LIMITES.minimoNaVotacao - marcadas.size;
  const erroDeData = validarDatasDaVotacao(fim || null, divulgacao || null, hoje);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  return (
    <form action={abrirVotacao} className="space-y-3 rounded-2xl border border-primary/30 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">🗳️ Abrir votação</p>

      <div>
        <label className={rotulo} htmlFor="titulo-votacao">Nome da votação</label>
        <input
          id="titulo-votacao"
          name="titulo"
          required
          minLength={3}
          maxLength={LIMITES.votacaoTituloMax}
          defaultValue={nomeSugerido}
          className={campo}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="fim-votacao">Votação aberta até (inclusive)</label>
          <input
            id="fim-votacao"
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
          <label className={rotulo} htmlFor="divulgacao-votacao">Divulgação do resultado</label>
          <input
            id="divulgacao-votacao"
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

      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        Premiação (da Configuração):{" "}
        {premiosDe(premios)
          .map((p) => `${p.medalha} ${formatarReais(p.valor)}`)
          .join(" · ")}
      </p>

      <fieldset>
        <legend className={rotulo}>Práticas aprovadas na votação</legend>
        <ul className="space-y-2">
          {praticas.map((p) => (
            <li key={p.id}>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${
                  marcadas.has(p.id) ? "border-primary bg-primary-soft" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  name="pratica_id"
                  value={p.id}
                  checked={marcadas.has(p.id)}
                  onChange={() => alternar(p.id)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-slate-800">{p.titulo}</span>
                  <span className="block text-xs text-slate-500">{p.autor}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {faltam > 0 && (
        <p className="text-xs font-semibold text-amber-700">
          Marque pelo menos {LIMITES.minimoNaVotacao} práticas para abrir a votação.
        </p>
      )}
      {erroDeData && <p className="text-xs font-semibold text-amber-700">{erroDeData}</p>}

      <BotaoEnviar
        disabled={faltam > 0 || Boolean(erroDeData)}
        textoEnviando="Abrindo..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Abrir votação com {marcadas.size} prática{marcadas.size === 1 ? "" : "s"} e avisar a revenda
      </BotaoEnviar>
    </form>
  );
}
