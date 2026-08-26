"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComboboxProduto } from "@/components/produtividade-armazem/ComboboxProduto";
import { ComboboxNome } from "@/components/produtividade-armazem/ComboboxNome";
import { ROTULO_UNIDADE_ITEM, UNIDADES_ITEM, diasAteValidade } from "@/lib/carretas";
import { buscarEmpilhadores } from "@/app/admin/produtividade-armazem/actions";
import { finalizarConferencia } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `item-${contador}`;
}

/** A contagem de dias pra vencer aparece sempre -- só a cor/ênfase muda
 *  conforme o mínimo configurado (não é mais "só mostra se estiver
 *  abaixo do limite"). */
function CampoValidade({ diasMinimosValidadeAlerta }: { diasMinimosValidadeAlerta: number }) {
  const [validade, setValidade] = useState("");
  const dias = validade ? diasAteValidade(validade) : null;
  const abaixoDoMinimo = dias !== null && dias < diasMinimosValidadeAlerta;

  return (
    <div>
      <label className={rotulo}>Validade</label>
      <input
        name="validade"
        type="date"
        value={validade}
        onChange={(e) => setValidade(e.target.value)}
        required
        className={campo}
      />
      {dias !== null && (
        <p className={`mt-1 text-xs ${abaixoDoMinimo ? "font-semibold text-amber-700" : "text-slate-500"}`}>
          {abaixoDoMinimo ? "⚠️ " : ""}
          {dias < 0 ? "Produto já vencido" : `Vence em ${dias} dia${dias === 1 ? "" : "s"}`}
          {abaixoDoMinimo && ` — abaixo do mínimo configurado (${diasMinimosValidadeAlerta} dias)`}
        </p>
      )}
    </div>
  );
}

export function FormFinalizarConferencia({
  atendimentoId,
  diasMinimosValidadeAlerta,
}: {
  atendimentoId: string;
  diasMinimosValidadeAlerta: number;
}) {
  const [itens, setItens] = useState<string[]>([novaChave()]);
  const [empilhadores, setEmpilhadores] = useState<Record<string, string>>({ [itens[0]]: "" });

  return (
    <form action={finalizarConferencia} className="space-y-4">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">🔍 Itens da conferência</h2>
        {itens.map((chave, i) => (
          <div key={chave} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={rotulo}>Recebido</label>
                <input name="quantidade" type="number" inputMode="decimal" min={0} step="0.01" required className={campo} />
              </div>
              <div>
                <label className={rotulo}>Avariado</label>
                <input
                  name="quantidade_avariada"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                  className={campo}
                />
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
              <CampoValidade diasMinimosValidadeAlerta={diasMinimosValidadeAlerta} />
            </div>

            <div>
              <label className={rotulo}>Empilhador</label>
              <ComboboxNome
                nome={empilhadores[chave] ?? ""}
                onChange={(v) => setEmpilhadores((atual) => ({ ...atual, [chave]: v }))}
                buscar={buscarEmpilhadores}
                placeholder="Quem descarregou"
                required
              />
              <input type="hidden" name="empilhador" value={empilhadores[chave] ?? ""} />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setItens((atual) => {
              const chave = novaChave();
              setEmpilhadores((e) => ({ ...e, [chave]: "" }));
              return [...atual, chave];
            })
          }
          aria-label="Adicionar item"
          className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-primary hover:text-primary"
        >
          +
        </button>
      </div>

      <BotaoEnviar
        textoEnviando="Finalizando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        ✅ Finalizar conferência
      </BotaoEnviar>
    </form>
  );
}
