"use client";

import { useEffect, useRef, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import { ComboboxNome } from "@/components/produtividade-armazem/ComboboxNome";
import {
  MAX_ITENS_CONFERENCIA,
  ROTULO_UNIDADE_ITEM,
  UNIDADES_ITEM,
  diasAteValidade,
  produtoSemValidade,
} from "@/lib/carretas";
import {
  buscarEmpilhadores,
  buscarProdutosParaConferencia,
} from "@/app/admin/produtividade-armazem/actions";

/** O filtro de Cluster/Tipo é lembrado em cookie -- por TELA, para o
 *  "Cerveja/Descartável" do Reepack não mandar aqui (ver
 *  ComboboxProdutoReepack). */
const COOKIE_CONFERENCIA_PATH = "/carretas-conferencia";
import { criarEmpilhadorRapido, finalizarConferencia } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `item-${contador}`;
}

/**
 * A contagem de dias pra vencer aparece sempre -- só a cor/ênfase muda
 * conforme o mínimo configurado.
 *
 * A DATA É OBRIGATÓRIA, MENOS NO MARKETPLACE (pedido do dono,
 * 05/09/2026). Em 03/09 ela virou opcional para todo mundo por causa dos
 * destilados que não vencem; era largo demais, e opcional para todos
 * custava caro em silêncio: o item que vence entrava sem data, e sem
 * data não existe alerta de validade mínima -- o produto perto de vencer
 * passava pela conferência sem ninguém ver.
 *
 * `obrigatoria` chega de fora porque depende do produto escolhido no
 * combobox ACIMA deste campo: enquanto ninguém escolheu, a data já entra
 * exigida, que é o caso da maioria.
 */
function CampoValidade({
  diasMinimosValidadeAlerta,
  obrigatoria,
  motivoDaExcecao,
}: {
  diasMinimosValidadeAlerta: number;
  obrigatoria: boolean;
  motivoDaExcecao: string | null;
}) {
  const [validade, setValidade] = useState("");
  const dias = validade ? diasAteValidade(validade) : null;
  const abaixoDoMinimo = dias !== null && dias < diasMinimosValidadeAlerta;

  return (
    <div>
      <label className={rotulo}>
        Validade {obrigatoria ? "*" : "(opcional)"}
      </label>
      <input
        name="validade"
        type="date"
        required={obrigatoria}
        value={validade}
        onChange={(e) => setValidade(e.target.value)}
        className={campo}
      />
      {/* Diz POR QUE ficou opcional. Um campo que muda de exigência
          sozinho, sem explicar, parece defeito -- e na dúvida a pessoa
          inventa uma data para "garantir". */}
      {motivoDaExcecao && (
        <p className="mt-1 text-xs text-slate-500">{motivoDaExcecao}</p>
      )}
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
  clusters = [],
  tipos = [],
}: {
  atendimentoId: string;
  diasMinimosValidadeAlerta: number;
  empilhadoresCadastrados?: { id: string; nome: string }[];
  clusters?: string[];
  tipos?: string[];
}) {
  const [itens, setItens] = useState<string[]>([novaChave()]);
  const [empilhadores, setEmpilhadores] = useState<Record<string, string>>({ [itens[0]]: "" });
  /* O CLUSTER do produto escolhido em cada item -- é ele que decide se a
     validade daquele item é obrigatória. Fica por CHAVE porque cada item
     tem o seu: uma carreta pode trazer um destilado de marketplace e uma
     cerveja na mesma conferência, e a regra vale item a item. */
  const [produtos, setProdutos] = useState<Record<string, string | null>>({});

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

            {/* O MESMO FILTRO DO REEPACK (pedido do dono, 05/09/2026):
                Cluster e Tipo estreitam a lista antes de digitar, e é o
                que permite achar o produto sem acertar as letras do
                nome. A busca aqui varre a base INTEIRA, não só o que
                está pronto para reembalar -- a carreta traz qualquer
                SKU. */}
            <div>
              <ComboboxProdutoReepack
                clusters={clusters}
                tipos={tipos}
                buscarProdutos={buscarProdutosParaConferencia}
                cookiePath={COOKIE_CONFERENCIA_PATH}
                aoEscolher={(p) =>
                  setProdutos((atual) => ({ ...atual, [chave]: p?.cluster ?? null }))
                }
              />
            </div>

            <CamposQuantidade />

            {/* O LOTE continua opcional (03/09/2026): a operação não o
                usa. A VALIDADE voltou a ser obrigatória em 05/09, menos
                no marketplace -- ver CampoValidade. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Lote (opcional)</label>
                <input name="lote" className={campo} />
              </div>
              <CampoValidade
                diasMinimosValidadeAlerta={diasMinimosValidadeAlerta}
                obrigatoria={!produtoSemValidade(produtos[chave])}
                motivoDaExcecao={
                  produtoSemValidade(produtos[chave])
                    ? "Produto de MKT Place — pode ficar em branco (há item que não vence, como destilado)."
                    : null
                }
              />
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
