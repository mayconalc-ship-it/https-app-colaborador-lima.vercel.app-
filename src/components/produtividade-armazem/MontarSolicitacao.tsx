"use client";

import { useState } from "react";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { buscarProdutosAbastecimento } from "@/app/produtividade-armazem/abastecimento/actions";
import { criarSolicitacao } from "@/app/produtividade-armazem/ressuprimento/actions";
import {
  ROTULO_UNIDADE_ABASTECIMENTO,
  UNIDADES_ABASTECIMENTO,
  COOKIE_ABASTECIMENTO_PATH,
  type UnidadeAbastecimento,
} from "@/lib/abastecimento";
import { ROTULO_PRIORIDADE, PRIORIDADES } from "@/lib/ressuprimento";
import { ROTULO_TURNO, TURNOS, type Turno } from "@/lib/produtividade-armazem";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Escolhido = {
  /** Chave só da tela -- o banco gera o id de verdade. */
  chave: number;
  produtoId: string;
  produtoRotulo: string;
  unidade: UnidadeAbastecimento;
  quantidade: string;
};

/**
 * Monta a solicitação inteira antes de enviar.
 *
 * A lista vive AQUI, no navegador, e sobe de uma vez. O desenho
 * alternativo -- gravar cada item assim que é escolhido -- obrigaria a
 * inventar um estado de "rascunho", senão a fila da empilhadeira mostraria
 * pedidos pela metade e o operador sairia buscando um palete enquanto a
 * pessoa ainda escolhia o segundo item.
 *
 * O preço é perder a lista se a aba fechar no meio. É aceitável: a lista
 * leva segundos para refazer, e um pedido incompleto na fila custa uma
 * viagem de empilhadeira.
 */
export function MontarSolicitacao({
  clusters,
  tipos,
  turnoSugerido,
}: {
  clusters: string[];
  tipos: string[];
  turnoSugerido: Turno;
}) {
  const [itens, setItens] = useState<Escolhido[]>([]);
  const [unidade, setUnidade] = useState<UnidadeAbastecimento>("palete");
  const [quantidade, setQuantidade] = useState("1");
  // Remonta o combobox depois de cada inclusão: sem trocar a chave, o
  // produto escolhido continuaria escrito no campo e a pessoa acharia que
  // não foi adicionado -- ou adicionaria o mesmo item duas vezes.
  const [rodada, setRodada] = useState(0);

  function adicionar() {
    const form = document.getElementById("form-item-solicitacao") as HTMLFormElement | null;
    if (!form) return;
    const dados = new FormData(form);
    const produtoId = String(dados.get("produto_id") ?? "");
    const texto = (form.querySelector("#produto-busca") as HTMLInputElement | null)?.value ?? "";

    if (!produtoId) {
      alert("Escolha o produto na lista antes de adicionar.");
      return;
    }
    const qtd = Number(quantidade.replace(",", "."));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      alert("Informe uma quantidade maior que zero.");
      return;
    }
    if (itens.some((i) => i.produtoId === produtoId && i.unidade === unidade)) {
      alert("Este produto já está na lista com esta unidade. Ajuste a quantidade dele.");
      return;
    }

    setItens((atual) => [
      ...atual,
      { chave: Date.now(), produtoId, produtoRotulo: texto || produtoId, unidade, quantidade },
    ]);
    setQuantidade("1");
    setRodada((r) => r + 1);
  }

  return (
    <div className="space-y-4">
      {/* Formulário SÓ do combobox: fica separado do que envia a
          solicitação porque um <form> dentro de outro não existe em HTML,
          e o combobox precisa de um para o FormData de cima ler o id. */}
      <form id="form-item-solicitacao" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ComboboxProdutoReepack
          key={rodada}
          clusters={clusters}
          tipos={tipos}
          buscarProdutos={buscarProdutosAbastecimento}
          cookiePath={COOKIE_ABASTECIMENTO_PATH}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo} htmlFor="unidade-item">Unidade</label>
            <select
              id="unidade-item"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as UnidadeAbastecimento)}
              className={campo}
            >
              {UNIDADES_ABASTECIMENTO.map((u) => (
                <option key={u} value={u}>{ROTULO_UNIDADE_ABASTECIMENTO[u]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="qtd-item">Quantidade</label>
            <input
              id="qtd-item"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className={campo}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={adicionar}
          className="w-full rounded-xl border border-primary bg-primary-soft px-4 py-3 text-sm font-semibold text-primary-dark hover:bg-primary-soft/70"
        >
          ➕ Adicionar à solicitação
        </button>
      </form>

      {itens.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Escolha os produtos que precisam subir para o picking. A empilhadeira só vê a
          solicitação depois que você enviar.
        </p>
      ) : (
        <form action={criarSolicitacao} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Itens da solicitação
            <span className="ml-2 font-normal text-slate-400">({itens.length})</span>
          </h2>

          <ul className="space-y-2">
            {itens.map((i) => (
              <li
                key={i.chave}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-slate-700">{i.produtoRotulo}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                  {i.quantidade} {ROTULO_UNIDADE_ABASTECIMENTO[i.unidade].toLowerCase()}
                  {Number(i.quantidade.replace(",", ".")) > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setItens((a) => a.filter((x) => x.chave !== i.chave))}
                  aria-label={`Tirar ${i.produtoRotulo} da solicitação`}
                  className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200"
                >
                  ✕
                </button>
                <input type="hidden" name="item_produto_id" value={i.produtoId} />
                <input type="hidden" name="item_unidade" value={i.unidade} />
                <input type="hidden" name="item_quantidade" value={i.quantidade} />
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={rotulo} htmlFor="turno">Turno</label>
              <select id="turno" name="turno" defaultValue={turnoSugerido} className={campo}>
                {TURNOS.map((t) => (
                  <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="prioridade">Prioridade</label>
              <select id="prioridade" name="prioridade" defaultValue="normal" className={campo}>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PRIORIDADE[p].emoji} {ROTULO_PRIORIDADE[p].rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-400">{ROTULO_PRIORIDADE.urgente.ajuda}</p>

          <div>
            <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
            <input
              id="observacao"
              name="observacao"
              maxLength={300}
              placeholder="Ex.: corredor 3, posição do fundo"
              className={campo}
            />
          </div>

          <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
            📤 Enviar para a empilhadeira
          </BotaoEnviar>
        </form>
      )}
    </div>
  );
}
