"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComboboxProduto } from "@/components/produtividade-armazem/ComboboxProduto";
import { ROTULO_UNIDADE_ITEM, UNIDADES_ITEM } from "@/lib/carretas";
import { assumirEDescarregar } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `item-${contador}`;
}

export function FormAssumir({ atendimentoId }: { atendimentoId: string }) {
  const [itens, setItens] = useState<string[]>([novaChave()]);

  return (
    <form action={assumirEDescarregar} className="space-y-4">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">Itens da descarga</h2>
        {itens.map((chave, i) => (
          <div key={chave} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Item {i + 1}</span>
              {itens.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItens((atual) => atual.filter((c) => c !== chave))}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Remover
                </button>
              )}
            </div>

            <div>
              <label className={rotulo}>Produto</label>
              <ComboboxProduto />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Quantidade</label>
                <input name="quantidade" type="number" inputMode="decimal" min={0} step="0.01" required className={campo} />
              </div>
              <div>
                <label className={rotulo}>Unidade</label>
                <select name="unidade" required className={campo} defaultValue={UNIDADES_ITEM[0]}>
                  {UNIDADES_ITEM.map((u) => (
                    <option key={u} value={u}>{ROTULO_UNIDADE_ITEM[u]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Lote</label>
                <input name="lote" required className={campo} />
              </div>
              <div>
                <label className={rotulo}>Validade</label>
                <input name="validade" type="date" required className={campo} />
              </div>
            </div>

            <div>
              <label className={rotulo}>Empilhador</label>
              <input name="empilhador" required className={campo} placeholder="Quem vai descarregar" />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItens((atual) => [...atual, novaChave()])}
          className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-primary hover:text-primary"
        >
          + Adicionar item
        </button>
      </div>

      <BotaoEnviar
        textoEnviando="Assumindo..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Assumir e iniciar descarga
      </BotaoEnviar>
    </form>
  );
}
