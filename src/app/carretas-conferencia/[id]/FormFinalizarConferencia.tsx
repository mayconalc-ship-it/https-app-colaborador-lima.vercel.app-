"use client";

import { useEffect, useRef, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { ComboboxProduto } from "@/components/produtividade-armazem/ComboboxProduto";
import { ComboboxNome } from "@/components/produtividade-armazem/ComboboxNome";
import {
  MAX_ITENS_CONFERENCIA,
  ROTULO_UNIDADE_ITEM,
  UNIDADES_ITEM,
  diasAteValidade,
} from "@/lib/carretas";
import { buscarEmpilhadores } from "@/app/admin/produtividade-armazem/actions";
import { criarEmpilhadorRapido, finalizarConferencia } from "./actions";

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
      <label className={rotulo}>Validade (opcional)</label>
      <input
        name="validade"
        type="date"
        value={validade}
        onChange={(e) => setValidade(e.target.value)}
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

/**
 * Recebido, avariado e unidade -- com a comparação feita no navegador.
 *
 * "A quantidade avariada não pode ser maior que a recebida" era erro só
 * de servidor, e erro de servidor aqui é um redirect: a pessoa voltava
 * para o formulário VAZIO e perdia os outros dez itens que já tinha
 * digitado. Um dígito a mais no campo errado custava a conferência
 * inteira.
 *
 * Com o `setCustomValidity`, o navegador barra o envio, rola até o campo
 * e mostra a mensagem nele -- sem sair da tela. A trava do servidor
 * continua lá: ela é a que vale, esta só evita o prejuízo.
 */
function CamposQuantidade() {
  const [recebido, setRecebido] = useState("");
  const [avariado, setAvariado] = useState("0");
  const avariadoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const campoAvariado = avariadoRef.current;
    if (!campoAvariado) return;
    const r = Number(recebido);
    const a = Number(avariado);
    const passou = Number.isFinite(r) && Number.isFinite(a) && a > r;
    campoAvariado.setCustomValidity(
      passou ? "O avariado faz parte do recebido — não pode ser maior." : "",
    );
  }, [recebido, avariado]);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={rotulo}>Recebido</label>
        <input
          name="quantidade"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
          value={recebido}
          onChange={(e) => setRecebido(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label className={rotulo}>Avariado</label>
        <input
          ref={avariadoRef}
          name="quantidade_avariada"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={avariado}
          onChange={(e) => setAvariado(e.target.value)}
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
  );
}

export function FormFinalizarConferencia({
  atendimentoId,
  diasMinimosValidadeAlerta,
  empilhadoresCadastrados = [],
}: {
  atendimentoId: string;
  diasMinimosValidadeAlerta: number;
  empilhadoresCadastrados?: { id: string; nome: string }[];
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

            <CamposQuantidade />

            {/* Lote e validade OPCIONAIS (pedido do dono, 03/09/2026):
                a operação não usa o lote, e há item que não vence --
                destilado de marketplace. Obrigar a data fazia o
                conferente inventar uma, e data inventada vira alerta de
                vencimento para produto que não vence. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Lote (opcional)</label>
                <input name="lote" className={campo} />
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
                criarRapido={criarEmpilhadorRapido}
                sugestoes={empilhadoresCadastrados}
              />
              <input type="hidden" name="empilhador" value={empilhadores[chave] ?? ""} />
            </div>
          </div>
        ))}

        {/* O teto para de ADICIONAR, e diz por quê -- não deixa preencher
            o próximo para recusar no envio. Sobra com folga: a maior
            conferência já gravada tem 17 itens. */}
        {itens.length < MAX_ITENS_CONFERENCIA ? (
          <BotaoAdicionarLinha
            onClick={() =>
              setItens((atual) => {
                const chave = novaChave();
                setEmpilhadores((e) => ({ ...e, [chave]: "" }));
                return [...atual, chave];
              })
            }
          >
            Adicionar item ({itens.length}/{MAX_ITENS_CONFERENCIA})
          </BotaoAdicionarLinha>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-center text-xs font-medium text-amber-800">
            Máximo de {MAX_ITENS_CONFERENCIA} itens por conferência. Finalize
            esta e, se a carreta tiver mais, abra outra conferência.
          </p>
        )}
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
