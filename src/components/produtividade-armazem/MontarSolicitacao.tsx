"use client";

import { useState } from "react";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { buscarProdutosAbastecimento } from "@/app/produtividade-armazem/abastecimento/actions";
import { criarSolicitacao } from "@/app/produtividade-armazem/abastecimento/ressuprimento-actions";
import {
  ROTULO_UNIDADE_ABASTECIMENTO,
  TIPOS_ABASTECIMENTO,
  TIPO_ABASTECIMENTO,
  UNIDADES_ABASTECIMENTO,
  COOKIE_ABASTECIMENTO_PATH,
  type TipoAbastecimento,
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
  tipoInicial,
  avisoSeDestoar,
  clusterInicial,
  tipoDoProdutoInicial,
}: {
  clusters: string[];
  tipos: string[];
  turnoSugerido: Turno;
  /** O filtro Cluster/Tipo lembrado do último uso, lido do cookie PELO
   *  SERVIDOR -- ver o comentário no ComboboxProdutoReepack abaixo. */
  clusterInicial: string;
  /** O "tipo" do PRODUTO (Descartável/Retornável), não o do abastecimento.
   *  Os dois se chamam "tipo" e ficam a três linhas de distância; o nome
   *  aqui é diferente de propósito, para não trocar um pelo outro. */
  tipoDoProdutoInicial: string;
  /** O tipo que o HORÁRIO sugere -- calculado no servidor, no fuso da
   *  operação (ver tipoSugerido em lib/abastecimento). */
  tipoInicial: TipoAbastecimento;
  /**
   * A frase a mostrar quando a pessoa escolhe o OUTRO tipo.
   *
   * Vem pronta do servidor porque só ele sabe a hora da operação -- o
   * relógio do celular de quem abre a tela não serve, cada um acerta
   * como quer. Como são só dois tipos, "o outro" é sempre um só, e uma
   * frase basta.
   */
  avisoSeDestoar: string | null;
}) {
  const [itens, setItens] = useState<Escolhido[]>([]);
  const [tipo, setTipo] = useState<TipoAbastecimento>(tipoInicial);
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


  const temItens = itens.length > 0;

  return (
    <div className="space-y-3">
      {/* ---------- PASSO 1: O TIPO ----------
          Vem primeiro, e sempre visível. Antes ficava dentro do bloco que
          só aparecia depois do primeiro produto -- o dono viu na hora:
          "ao entrar não vejo de cara as opções de Completo e de Pontual,
          depois de enviar o primeiro produto é que ele aparece".

          E a ordem não é estética: o tipo é a única escolha que muda o
          significado de tudo o que vem depois. Uma varredura da manhã e um
          chamado pontual não se comparam pelo mesmo relógio, e descobrir
          isso só no fim convida a errar no piloto automático. */}
      <Passo numero={1} titulo="Que abastecimento é este?">
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_ABASTECIMENTO.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center ${
                tipo === t
                  ? "border-primary bg-primary-soft text-primary-dark"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="tipo-visivel"
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="sr-only"
              />
              <span className="text-2xl leading-none">{TIPO_ABASTECIMENTO[t].emoji}</span>
              <span className="text-sm font-bold">{TIPO_ABASTECIMENTO[t].curto}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {TIPO_ABASTECIMENTO[tipo].descricao}
        </p>
        {/* O aviso é do horário de quando a tela abriu -- serve para pegar
            a escolha distraída, não para impedir a deliberada. Bloquear
            obrigaria a inventar exceção para o primeiro dia atípico. */}
        {avisoSeDestoar && tipo !== tipoInicial && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">⚠️ {avisoSeDestoar}</p>
        )}
      </Passo>

      {/* ---------- PASSO 2: OS PRODUTOS ---------- */}
      <Passo numero={2} titulo="O que precisa subir para o picking" contagem={itens.length}>
        {/* Formulário SÓ do combobox: fica separado do que envia o pedido
            porque um <form> dentro de outro não existe em HTML, e o
            combobox precisa de um para o FormData de cima ler o id. */}
        <form id="form-item-solicitacao" className="space-y-3">
          {/*
            `clusterInicial`/`tipoInicial` NÃO são opcionais de verdade, por
            mais que o tipo diga que sim. O combobox lembra o filtro em
            cookie, e QUEM LÊ o cookie primeiro é o servidor: sem essas
            props ele manda "Todos", o cliente lê o cookie e escolhe outra
            coisa -- e a pessoa recomeça o filtro a cada item que adiciona.
          */}
          <ComboboxProdutoReepack
            key={rodada}
            clusters={clusters}
            tipos={tipos}
            clusterInicial={clusterInicial}
            tipoInicial={tipoDoProdutoInicial}
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
            className="w-full rounded-xl border-2 border-primary bg-primary-soft px-4 py-3 text-sm font-bold text-primary-dark hover:bg-primary-soft/70"
          >
            ➕ Adicionar ao pedido
          </button>
        </form>

        {temItens && (
          <ul className="mt-3 space-y-2">
            {itens.map((i) => (
              <li
                key={i.chave}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200"
              >
                <span className="min-w-0 flex-1 leading-snug text-slate-700">{i.produtoRotulo}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-bold leading-none tabular-nums text-slate-900">
                    {i.quantidade}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {ROTULO_UNIDADE_ABASTECIMENTO[i.unidade].toLowerCase()}
                    {Number(i.quantidade.replace(",", ".")) > 1 ? "s" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setItens((a) => a.filter((x) => x.chave !== i.chave))}
                  aria-label={`Tirar ${i.produtoRotulo} do pedido`}
                  className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Passo>

      {/* ---------- PASSO 3: ENVIAR ----------
          Aparece apagado enquanto não há produto, em vez de sumir: quem
          abre a tela precisa ver que existe um fim, e um passo que aparece
          do nada assusta mais do que um passo desligado. */}
      <Passo numero={3} titulo="Enviar para a empilhadeira" apagado={!temItens}>
        {!temItens ? (
          <p className="text-sm text-slate-400">
            Adicione pelo menos um produto acima. A empilhadeira só vê o pedido depois que você
            enviar.
          </p>
        ) : (
          <form action={criarSolicitacao} className="space-y-3">
            {/* O tipo é escolhido no passo 1, e viaja escondido daqui --
                junto dos itens, que também são estado desta tela. */}
            <input type="hidden" name="tipo" value={tipo} />
            {itens.map((i) => (
              <div key={i.chave}>
                <input type="hidden" name="item_produto_id" value={i.produtoId} />
                <input type="hidden" name="item_unidade" value={i.unidade} />
                <input type="hidden" name="item_quantidade" value={i.quantidade} />
              </div>
            ))}

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
              <label className={rotulo} htmlFor="observacao">Onde está / observação (opcional)</label>
              <input
                id="observacao"
                name="observacao"
                maxLength={300}
                placeholder="Ex.: corredor 3, posição do fundo"
                className={campo}
              />
            </div>

            <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white hover:bg-primary-dark">
              📤 Enviar pedido ({itens.length} {itens.length === 1 ? "item" : "itens"})
            </BotaoEnviar>
          </form>
        )}
      </Passo>
    </div>
  );
}

/**
 * Uma etapa numerada, no formato do Monitor de Recebimento -- pedido do
 * dono: "deixe essas etapas no mesmo formato do monitor de pedidos".
 *
 * O número não é enfeite: ele diz que existe uma ORDEM e quantas paradas
 * faltam. Antes os três blocos tinham o mesmo peso visual e a pessoa não
 * sabia por onde começar -- foi assim que o tipo de abastecimento acabou
 * sendo a última coisa a ser informada, quando devia ser a primeira.
 */
function Passo({
  numero,
  titulo,
  contagem,
  apagado = false,
  children,
}: {
  numero: number;
  titulo: string;
  contagem?: number;
  apagado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        apagado ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <h2 className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            apagado ? "bg-slate-200 text-slate-500" : "bg-primary text-white"
          }`}
        >
          {numero}
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{titulo}</span>
        {contagem !== undefined && contagem > 0 && (
          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold tabular-nums text-primary-dark">
            {contagem}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}
