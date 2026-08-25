"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import type { Fabrica, Transportadora } from "@/lib/produtividade-armazem";
import { registrarRecebimento } from "./actions";
import { ComboboxProduto } from "./ComboboxProduto";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `item-${contador}`;
}

export function FormRecebimento({
  fabricas,
  transportadoras,
}: {
  fabricas: Fabrica[];
  transportadoras: Transportadora[];
}) {
  const [itens, setItens] = useState<string[]>([novaChave()]);

  return (
    <form action={registrarRecebimento} className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="fabrica_id">Fábrica de saída</label>
            <select id="fabrica_id" name="fabrica_id" required className={campo}>
              {fabricas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="transportadora_id">Transportadora</label>
            <select id="transportadora_id" name="transportadora_id" required className={campo}>
              {transportadoras.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="placa_cavalo">Placa do cavalo (opcional)</label>
            <input id="placa_cavalo" name="placa_cavalo" maxLength={10} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="placa_carreta">Placa da carreta</label>
            <input id="placa_carreta" name="placa_carreta" maxLength={10} required className={campo} />
          </div>
        </div>

        <div>
          <label className={rotulo} htmlFor="motoristas">Motorista(s)</label>
          <input id="motoristas" name="motoristas" required className={campo} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="ajudante_nome">Ajudante (opcional)</label>
            <input id="ajudante_nome" name="ajudante_nome" className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="operador_nome">Operador (opcional)</label>
            <input id="operador_nome" name="operador_nome" className={campo} />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          O conferente é você, registrado automaticamente pela sessão.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">Produtos</h2>
        {itens.map((chave, i) => (
          <div key={chave} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Qtd. recebida</label>
                <input
                  name="quantidade_recebida"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  required
                  defaultValue={0}
                  className={campo}
                />
              </div>
              <div>
                <label className={rotulo}>Qtd. avariada</label>
                <input
                  name="quantidade_avariada"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  required
                  defaultValue={0}
                  className={campo}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItens((atual) => [...atual, novaChave()])}
          className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-primary hover:text-primary"
        >
          + Adicionar produto
        </button>
      </div>

      <BotaoEnviar
        textoEnviando="Salvando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Registrar recebimento
      </BotaoEnviar>
    </form>
  );
}
