"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { AREAS, type AreaId } from "@/lib/areas";
import { lerReais, validarConfig, type ConfigBoasPraticas } from "@/lib/boas-praticas";
import { salvarConfiguracao } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";
const bloco = "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

/**
 * A configuração do programa. Um Salvar para a tela toda, no fim, e ele só
 * liga quando `validarConfig` -- a mesma da ação -- não acha problema.
 */
export function FormConfiguracao({
  inicial,
  contagem,
  podeEditar,
}: {
  inicial: ConfigBoasPraticas;
  contagem: Record<AreaId | "sem", number>;
  podeEditar: boolean;
}) {
  const [areas, setAreas] = useState<AreaId[]>(inicial.areas);
  const [datas, setDatas] = useState({
    sugestoes_ate: inicial.sugestoes_ate ?? "",
    votacao_ate: inicial.votacao_ate ?? "",
    divulgacao_em: inicial.divulgacao_em ?? "",
  });
  const [premios, setPremios] = useState(
    [inicial.premio_1, inicial.premio_2, inicial.premio_3].map((v) => (v == null ? "" : String(v))),
  );

  const erro = validarConfig({
    areas,
    sugestoes_ate: datas.sugestoes_ate || null,
    votacao_ate: datas.votacao_ate || null,
    divulgacao_em: datas.divulgacao_em || null,
    premio_1: lerReais(premios[0]),
    premio_2: lerReais(premios[1]),
    premio_3: lerReais(premios[2]),
  });

  function alternarArea(id: AreaId) {
    setAreas((atual) => (atual.includes(id) ? atual.filter((a) => a !== id) : [...atual, id]));
  }

  return (
    <form action={salvarConfiguracao} className="space-y-4">
      <fieldset className={bloco} disabled={!podeEditar}>
        <legend className="sr-only">Áreas que participam</legend>
        <p className="text-sm font-bold text-slate-800">👥 Áreas que participam</p>
        <p className="text-xs text-slate-500">
          Só quem é destas áreas vê o cartão, sugere e vota. A área vem do cadastro do colaborador.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AREAS.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 ${
                areas.includes(a.id) ? "border-primary bg-primary-soft" : "border-slate-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="areas"
                  value={a.id}
                  checked={areas.includes(a.id)}
                  onChange={() => alternarArea(a.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold text-slate-800">{a.rotulo}</span>
              </span>
              <span className="text-xs tabular-nums text-slate-500">{contagem[a.id]} pessoas</span>
            </label>
          ))}
        </div>
        {contagem.sem > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            ⚠️ {contagem.sem} pessoa{contagem.sem === 1 ? "" : "s"} desta revenda {contagem.sem === 1 ? "está" : "estão"}{" "}
            com uma área que não é Distribuição nem Armazém no cadastro (TRANSPORTE, por exemplo) e{" "}
            {contagem.sem === 1 ? "fica" : "ficam"} fora do programa até a área ser corrigida em Colaboradores.
          </p>
        )}
      </fieldset>

      <fieldset className={bloco} disabled={!podeEditar}>
        <legend className="sr-only">Calendário</legend>
        <p className="text-sm font-bold text-slate-800">📅 Calendário</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["sugestoes_ate", "Sugestões até"],
              ["votacao_ate", "Votação até"],
              ["divulgacao_em", "Divulgação"],
            ] as const
          ).map(([nome, r]) => (
            <div key={nome}>
              <label className={rotulo} htmlFor={nome}>{r}</label>
              <input
                id={nome}
                name={nome}
                type="date"
                value={datas[nome]}
                onChange={(e) => setDatas((d) => ({ ...d, [nome]: e.target.value }))}
                className={campo}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Depois do prazo das sugestões o formulário fecha. A votação fecha sozinha no fim do último dia, e o
          resultado só pode ser divulgado a partir do dia da divulgação. Entre o fim das sugestões e a abertura da
          votação, a liderança analisa e aprova as que vão para a votação.
        </p>
      </fieldset>

      <fieldset className={bloco} disabled={!podeEditar}>
        <legend className="sr-only">Premiação</legend>
        <p className="text-sm font-bold text-slate-800">🎁 Premiação (R$)</p>
        <div className="grid grid-cols-3 gap-2">
          {["🥇 1º lugar", "🥈 2º lugar", "🥉 3º lugar"].map((r, i) => (
            <div key={r}>
              <label className={rotulo} htmlFor={`premio_${i + 1}`}>{r}</label>
              <input
                id={`premio_${i + 1}`}
                name={`premio_${i + 1}`}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={premios[i]}
                onChange={(e) =>
                  setPremios((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))
                }
                className={campo}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          A votação copia a premiação quando é aberta. Mudar aqui depois vale para a próxima votação — a aberta
          muda na tela de Boas Práticas.
        </p>
      </fieldset>

      {podeEditar && (
        <>
          {erro && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{erro}</p>}
          <BotaoEnviar
            disabled={Boolean(erro)}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Salvar configuração
          </BotaoEnviar>
        </>
      )}
    </form>
  );
}
