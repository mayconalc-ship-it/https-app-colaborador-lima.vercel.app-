"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { SelectComCadastroRapido } from "@/components/SelectComCadastroRapido";
import type { Fabrica, Transportadora } from "@/lib/produtividade-armazem";
import {
  criarFabricaRapida,
  criarTransportadoraRapida,
} from "@/app/produtividade-armazem/catalogos-rapidos";
import { registrarRecebimento } from "./actions";
import { ComboboxProduto } from "@/components/produtividade-armazem/ComboboxProduto";

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
  podeEditarCatalogo = false,
}: {
  fabricas: Fabrica[];
  transportadoras: Transportadora[];
  podeEditarCatalogo?: boolean;
}) {
  const [itens, setItens] = useState<string[]>([novaChave()]);

  return (
    <form action={registrarRecebimento} className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="fabrica_id">Fábrica de saída</label>
            <SelectComCadastroRapido
              id="fabrica_id"
              name="fabrica_id"
              required
              opcoes={fabricas.map((f) => ({ valor: f.id, rotulo: f.nome }))}
              criarRapido={podeEditarCatalogo ? criarFabricaRapida : undefined}
              campos={[{ nome: "nome", rotulo: "Nome da fábrica" }]}
              tituloCadastro="Nova fábrica"
            />
          </div>
          <div>
            {/* Opcional: exigi-la travava o recebimento no pátio quando a
                carreta era de uma transportadora que não estava no
                catálogo, e o conferente não vai parar a descarga para
                cadastrar (pedido do dono, 03/09/2026). */}
            <label className={rotulo} htmlFor="transportadora_id">
              Transportadora (opcional)
            </label>
            <SelectComCadastroRapido
              id="transportadora_id"
              name="transportadora_id"
              opcoes={transportadoras.map((t) => ({ valor: t.id, rotulo: t.nome }))}
              criarRapido={podeEditarCatalogo ? criarTransportadoraRapida : undefined}
              campos={[{ nome: "nome", rotulo: "Nome da transportadora" }]}
              tituloCadastro="Nova transportadora"
            />
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

        <BotaoAdicionarLinha onClick={() => setItens((atual) => [...atual, novaChave()])}>
          Adicionar produto
        </BotaoAdicionarLinha>
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
