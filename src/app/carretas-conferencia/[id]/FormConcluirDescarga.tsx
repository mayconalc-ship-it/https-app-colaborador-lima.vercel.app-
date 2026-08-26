"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { concluirDescarga } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Ag = { id: string; codigo: string; descricao: string; unidade: string };
type Fabrica = { id: string; nome: string };

let contador = 0;
function novaChave() {
  contador += 1;
  return `ag-${contador}`;
}

export function FormConcluirDescarga({
  atendimentoId,
  agCatalogo,
  fabricas,
}: {
  atendimentoId: string;
  agCatalogo: Ag[];
  fabricas: Fabrica[];
}) {
  const [retorno, setRetorno] = useState<"vazia" | "com_ag">("vazia");
  const [itensAg, setItensAg] = useState<string[]>([novaChave()]);

  return (
    <form action={concluirDescarga} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <p className="text-sm font-bold text-slate-800">🔄 A carreta irá retornar vazia?</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {(
          [
            { v: "vazia", rotulo: "Sim, vazia" },
            { v: "com_ag", rotulo: "Não — irá retornar com AG" },
          ] as const
        ).map(({ v, rotulo: r }) => (
          <label
            key={v}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold ${
              retorno === v ? "border-primary bg-primary-soft text-primary-dark" : "border-slate-300 text-slate-700"
            }`}
          >
            <input
              type="radio"
              name="retorno"
              value={v}
              checked={retorno === v}
              onChange={() => setRetorno(v)}
              className="sr-only"
            />
            {r}
          </label>
        ))}
      </div>

      {retorno === "com_ag" && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div>
            <label className={rotulo} htmlFor="destino_retorno">Destino da carreta</label>
            <select id="destino_retorno" name="destino_retorno" required className={campo} defaultValue="">
              <option value="" disabled>Escolha a fábrica de destino</option>
              {fabricas.map((f) => (
                <option key={f.id} value={f.nome}>{f.nome}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-slate-500">Itens de AG</h3>
            {agCatalogo.length === 0 ? (
              <p className="text-xs text-amber-700">
                Nenhum AG cadastrado ainda -- peça ao Admin para cadastrar em Configuração &gt; Recebimento.
              </p>
            ) : (
              itensAg.map((chave, i) => (
                <div key={chave} className="flex items-end gap-2 rounded-lg bg-white p-2 shadow-sm">
                  <div className="flex-1">
                    {i === 0 && <label className={rotulo}>AG</label>}
                    <select name="ag_id" required className={campo} defaultValue="">
                      <option value="" disabled>Escolha o AG</option>
                      {agCatalogo.map((a) => (
                        <option key={a.id} value={a.id}>{a.codigo} — {a.descricao}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    {i === 0 && <label className={rotulo}>Qtd.</label>}
                    <input name="ag_quantidade" type="number" inputMode="decimal" min={0} step="0.01" required className={campo} />
                  </div>
                  {itensAg.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItensAg((atual) => atual.filter((c) => c !== chave))}
                      className="mb-2 shrink-0 text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))
            )}
            {agCatalogo.length > 0 && (
              <button
                type="button"
                onClick={() => setItensAg((atual) => [...atual, novaChave()])}
                className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary"
              >
                + Adicionar item de AG
              </button>
            )}
          </div>
        </div>
      )}

      <BotaoEnviar
        textoEnviando="Concluindo..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        {retorno === "com_ag" ? "Concluir descarga e iniciar carga de AG" : "Concluir descarga e finalizar"}
      </BotaoEnviar>
    </form>
  );
}
