"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { SelectComCadastroRapido, type OpcaoSelect } from "@/components/SelectComCadastroRapido";
import type { CampoRapido } from "@/components/CadastroRapido";
import { ROTULO_UNIDADE_AG, UNIDADES_AG } from "@/lib/carretas";
import { criarAgRapido, criarFabricaRapida } from "@/app/produtividade-armazem/catalogos-rapidos";
import { editarRetornoAg } from "./actions";

const CAMPOS_AG: CampoRapido[] = [
  { nome: "codigo", rotulo: "Código" },
  { nome: "descricao", rotulo: "Descrição" },
  {
    nome: "unidade",
    rotulo: "Unidade",
    tipo: "select",
    opcoes: UNIDADES_AG.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE_AG[u] })),
  },
];

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Ag = { id: string; codigo: string; descricao: string; unidade: string };
type Fabrica = { id: string; nome: string };
type ItemAtual = { chave: string; agId: string; quantidade: string };

let contador = 0;
function novaChave() {
  contador += 1;
  return `corr-${contador}`;
}

/**
 * CORRIGIR O AG DO RETORNO -- só para a liderança (pedido do dono,
 * 05/09/2026, depois de um conferente enviar a lista incompleta e o
 * empilhador ficar com a informação errada na tela).
 *
 * NASCE PREENCHIDO com o que está lá hoje, e é o ponto: quase toda
 * correção é acrescentar o item que faltou, não refazer a lista. Um
 * formulário em branco obrigaria a redigitar o que já estava certo, e
 * cada redigitação é uma chance nova de errar.
 *
 * Fica atrás de um `<details>` fechado. A tela do atendimento é operada
 * no pátio, com o celular na mão -- um formulário de correção aberto ali
 * o tempo todo competiria com os botões da operação normal, que são o
 * que 99% das aberturas dessa tela querem.
 *
 * NÃO oferece "volta vazia": ver o comentário em editarRetornoAg. Isso
 * não é corrigir uma quantidade, é refazer a decisão.
 */
export function FormCorrigirRetornoAg({
  atendimentoId,
  agCatalogo,
  fabricas,
  destinoAtual,
  itensAtuais,
  podeEditarCatalogo = false,
}: {
  atendimentoId: string;
  agCatalogo: Ag[];
  fabricas: Fabrica[];
  destinoAtual: string | null;
  itensAtuais: { agId: string; quantidade: number }[];
  podeEditarCatalogo?: boolean;
}) {
  const [itens, setItens] = useState<ItemAtual[]>(() =>
    itensAtuais.length > 0
      ? itensAtuais.map((i) => ({
          chave: novaChave(),
          agId: i.agId,
          quantidade: String(i.quantidade),
        }))
      : [{ chave: novaChave(), agId: "", quantidade: "" }],
  );
  const [agExtras, setAgExtras] = useState<OpcaoSelect[]>([]);

  const opcoesAg: OpcaoSelect[] = [
    ...agCatalogo.map((a) => ({ valor: a.id, rotulo: `${a.codigo} — ${a.descricao}` })),
    ...agExtras,
  ];

  /* Só a quantidade fica em estado aqui. O AG escolhido mora dentro do
     SelectComCadastroRapido, que guarda o próprio valor e o envia pelo
     `name` -- duplicar isso no pai criaria duas fontes para o mesmo
     campo, e a divergência entre elas não daria erro: gravaria o AG
     errado. */
  function mudarQuantidade(chave: string, valor: string) {
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, quantidade: valor } : i)));
  }

  /*
    DISCRETO FECHADO (pedido do dono, 05/09/2026). Era um cartão âmbar
    inteiro com título e subtítulo -- do tamanho dos blocos da operação
    normal, e chamando mais atenção que eles.

    Corrigir é a exceção: acontece quando o conferente errou, e não em
    toda carreta. Fechado, é um link cinza de uma linha; aberto, aí sim
    vira o cartão âmbar, porque quem chegou até ali está mexendo no que o
    empilhador vai executar e precisa ver que é diferente do resto.
  */
  return (
    <details className="group/corr rounded-xl open:border open:border-amber-300 open:bg-amber-50">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 py-2 text-xs font-semibold text-slate-400 marker:content-none hover:text-slate-600 group-open/corr:px-4 group-open/corr:pt-3 group-open/corr:text-amber-900 [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open/corr:rotate-90" aria-hidden="true">
          ▸
        </span>
        ✏️ Corrigir o AG do retorno
      </summary>

      <form action={editarRetornoAg} className="space-y-3 p-4 pt-3">
        <p className="text-xs text-amber-800">
          Para quando o conferente informou incompleto. A lista salva aqui{" "}
          <strong>substitui</strong> a atual, e fica registrado quem corrigiu.
        </p>
        <input type="hidden" name="atendimento_id" value={atendimentoId} />

        <div>
          <label className={rotulo} htmlFor="destino_corrigido">Destino da carreta</label>
          <SelectComCadastroRapido
            id="destino_corrigido"
            name="destino_retorno"
            required
            placeholder="Escolha a fábrica de destino"
            opcoes={fabricas.map((f) => ({ valor: f.nome, rotulo: f.nome }))}
            valorInicial={destinoAtual ?? ""}
            usarRotuloComoValor
            criarRapido={podeEditarCatalogo ? criarFabricaRapida : undefined}
            campos={[{ nome: "nome", rotulo: "Nome da fábrica" }]}
            tituloCadastro="Nova fábrica"
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase text-amber-800">Itens de AG</h3>
          {itens.map((item, i) => (
            <div
              key={item.chave}
              className="min-w-0 rounded-lg bg-white p-2 shadow-sm sm:flex sm:items-end sm:gap-2"
            >
              <div className="min-w-0 sm:flex-1">
                <label className={rotulo}>AG {itens.length > 1 ? i + 1 : ""}</label>
                <SelectComCadastroRapido
                  name="ag_id"
                  required
                  placeholder="Escolha o AG"
                  opcoes={opcoesAg}
                  valorInicial={item.agId}
                  criarRapido={podeEditarCatalogo ? criarAgRapido : undefined}
                  campos={CAMPOS_AG}
                  tituloCadastro="Novo AG"
                  aoCriar={(nova) =>
                    setAgExtras((atual) =>
                      atual.some((o) => o.valor === nova.valor) ? atual : [...atual, nova],
                    )
                  }
                />
              </div>

              <div className="mt-2 flex items-end gap-2 sm:mt-0">
                <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
                  <label className={rotulo}>Qtd.</label>
                  <input
                    name="ag_quantidade"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    required
                    value={item.quantidade}
                    onChange={(e) => mudarQuantidade(item.chave, e.target.value)}
                    className={campo}
                  />
                </div>
                {itens.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItens((atual) => atual.filter((x) => x.chave !== item.chave))}
                    className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}

          <BotaoAdicionarLinha
            onClick={() =>
              setItens((atual) => [...atual, { chave: novaChave(), agId: "", quantidade: "" }])
            }
          >
            Adicionar item de AG
          </BotaoAdicionarLinha>
        </div>

        <BotaoEnviar
          textoEnviando="Salvando..."
          className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700"
        >
          ✏️ Salvar correção
        </BotaoEnviar>
      </form>
    </details>
  );
}
