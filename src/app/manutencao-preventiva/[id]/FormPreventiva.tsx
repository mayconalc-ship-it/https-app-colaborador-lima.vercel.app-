"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  FASES,
  NOTA_MAX,
  NOTA_MIN,
  itemVisivel,
  paraNumero,
  type ItemPreventiva,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";
import { finalizarPreventiva } from "../actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Só o que o formulário precisa guardar enquanto a pessoa digita. */
type Rascunho = {
  bool?: boolean | null;
  texto?: string;
  numero?: string;
  fases?: [string, string, string];
};

/**
 * A grade inteira com um Salvar só no fim -- são campos do mesmo assunto,
 * não vinte formulários.
 *
 * As perguntas condicionais somem e aparecem enquanto se responde: foi o
 * "Quantos litros?" sempre visível que encheu o Forms de "ID" em 48 das
 * 49 respostas.
 */
export function FormPreventiva({
  execucaoId,
  itens,
}: {
  execucaoId: string;
  itens: ItemPreventiva[];
}) {
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});

  function mudar(itemId: string, patch: Rascunho) {
    setRascunhos((a) => ({ ...a, [itemId]: { ...a[itemId], ...patch } }));
  }

  // Converte o rascunho para o formato que itemVisivel entende, para as
  // condicionais reagirem sem ida ao servidor.
  const respostas = new Map<string, RespostaPreventiva>();
  for (const item of itens) {
    const d = rascunhos[item.id] ?? {};
    respostas.set(item.id, {
      itemId: item.id,
      valorBool: d.bool ?? null,
      valorNumero: item.tipo === "numero" || item.tipo === "nota" ? paraNumero(d.numero) : null,
      valorNumeros: null,
      valorTexto: item.tipo === "opcao" || item.tipo === "texto" ? (d.texto ?? null) : null,
      observacao: null,
    });
  }

  const visiveis = itens.filter((i) => itemVisivel(i, itens, respostas));

  return (
    <form action={finalizarPreventiva} className="space-y-4">
      <input type="hidden" name="execucao_id" value={execucaoId} />

      {visiveis.map((item, i) => {
        const d = rascunhos[item.id] ?? {};
        return (
          <div key={item.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                <span className="mr-1 text-slate-400">{i + 1}.</span>
                {item.pergunta}
              </p>
              {item.ajuda && <p className="mt-0.5 text-xs text-slate-500">{item.ajuda}</p>}
            </div>

            {item.tipo === "sim_nao" && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "true", r: "Sim" },
                  { v: "false", r: "Não" },
                ].map(({ v, r }) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border-2 py-3 text-sm font-semibold ${
                      String(d.bool) === v
                        ? v === "true"
                          ? "border-green-500 bg-green-50 text-green-800"
                          : "border-red-400 bg-red-50 text-red-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`item_${item.id}`}
                      value={v}
                      checked={String(d.bool) === v}
                      onChange={() => mudar(item.id, { bool: v === "true" })}
                      className="sr-only"
                      required={item.obrigatorio}
                    />
                    {r}
                  </label>
                ))}
              </div>
            )}

            {item.tipo === "numero" && (
              <div className="flex items-center gap-2">
                <input
                  name={`item_${item.id}`}
                  type="text"
                  inputMode="decimal"
                  value={d.numero ?? ""}
                  onChange={(e) => mudar(item.id, { numero: e.target.value })}
                  placeholder={item.casasDecimais > 0 ? `0,${"0".repeat(item.casasDecimais)}` : "0"}
                  required={item.obrigatorio}
                  className={`${campo} max-w-40`}
                />
                {item.unidade && <span className="text-sm font-semibold text-slate-500">{item.unidade}</span>}
              </div>
            )}

            {/* Três campos separados, não uma frase. No Forms isso era
                texto livre e saiu "L3: 22" -- era 220, e ninguém viu. */}
            {item.tipo === "trifasico" && (
              <div className="grid grid-cols-3 gap-2">
                {FASES.map((fase, idx) => (
                  <div key={fase}>
                    <label className={rotulo} htmlFor={`item_${item.id}_${fase.toLowerCase()}`}>
                      {fase}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        id={`item_${item.id}_${fase.toLowerCase()}`}
                        name={`item_${item.id}_${fase.toLowerCase()}`}
                        type="text"
                        inputMode="decimal"
                        value={d.fases?.[idx] ?? ""}
                        onChange={(e) => {
                          const atual: [string, string, string] = [...(d.fases ?? ["", "", ""])] as [
                            string,
                            string,
                            string,
                          ];
                          atual[idx] = e.target.value;
                          mudar(item.id, { fases: atual });
                        }}
                        placeholder="220"
                        required={item.obrigatorio}
                        className={campo}
                      />
                      {item.unidade && <span className="text-xs text-slate-400">{item.unidade}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {item.tipo === "opcao" && (
              <div className="space-y-2">
                {item.opcoes.map((o) => (
                  <label
                    key={o}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
                      d.texto === o ? "border-primary bg-primary-soft font-semibold" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`item_${item.id}`}
                      value={o}
                      checked={d.texto === o}
                      onChange={() => mudar(item.id, { texto: o })}
                      required={item.obrigatorio}
                    />
                    {o}
                  </label>
                ))}
              </div>
            )}

            {item.tipo === "nota" && (
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: NOTA_MAX - NOTA_MIN + 1 }, (_, k) => NOTA_MIN + k).map((n) => (
                  <label
                    key={n}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border-2 py-3 text-base font-bold ${
                      d.numero === String(n)
                        ? "border-primary bg-primary-soft text-primary-dark"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`item_${item.id}`}
                      value={n}
                      checked={d.numero === String(n)}
                      onChange={() => mudar(item.id, { numero: String(n) })}
                      className="sr-only"
                      required={item.obrigatorio}
                    />
                    {n}
                  </label>
                ))}
              </div>
            )}

            {item.tipo === "texto" && (
              <textarea
                name={`item_${item.id}`}
                rows={2}
                maxLength={500}
                value={d.texto ?? ""}
                onChange={(e) => mudar(item.id, { texto: e.target.value })}
                required={item.obrigatorio}
                className={campo}
              />
            )}

            <details>
              <summary className="cursor-pointer list-none text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
                + Observação
              </summary>
              <input
                name={`obs_${item.id}`}
                maxLength={500}
                placeholder="Algo fora do normal neste item?"
                className={`${campo} mt-2`}
              />
            </details>
          </div>
        );
      })}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className={rotulo} htmlFor="observacao">
          Observação geral (opcional)
        </label>
        <textarea id="observacao" name="observacao" rows={3} maxLength={1000} className={campo} />
      </div>

      <BotaoEnviar
        textoEnviando="Salvando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        ✅ Finalizar preventiva
      </BotaoEnviar>
    </form>
  );
}
