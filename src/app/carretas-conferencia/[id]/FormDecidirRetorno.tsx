"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { SelectComCadastroRapido, type OpcaoSelect } from "@/components/SelectComCadastroRapido";
import type { CampoRapido } from "@/components/CadastroRapido";
import { ROTULO_UNIDADE_AG, UNIDADES_AG } from "@/lib/carretas";
import { criarAgRapido, criarFabricaRapida } from "@/app/produtividade-armazem/catalogos-rapidos";
import { decidirRetorno } from "./actions";

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

let contador = 0;
function novaChave() {
  contador += 1;
  return `ag-${contador}`;
}

export function FormDecidirRetorno({
  atendimentoId,
  agCatalogo,
  fabricas,
  podeEditarCatalogo = false,
}: {
  atendimentoId: string;
  agCatalogo: Ag[];
  fabricas: Fabrica[];
  podeEditarCatalogo?: boolean;
}) {
  const confirmarEnvio = useConfirmarEnvio();
  const [retorno, setRetorno] = useState<"vazia" | "com_ag">("vazia");
  const [itensAg, setItensAg] = useState<string[]>([novaChave()]);
  // AG cadastrado pelo "+" numa linha precisa aparecer em TODAS as linhas,
  // por isso a lista extra mora aqui, no pai, e não dentro de cada select.
  const [agExtras, setAgExtras] = useState<OpcaoSelect[]>([]);
  const opcoesAg: OpcaoSelect[] = [
    ...agCatalogo.map((a) => ({ valor: a.id, rotulo: `${a.codigo} — ${a.descricao}` })),
    ...agExtras,
  ];

  return (
    <form
      action={decidirRetorno}
      // Só "vazia" pede confirmação: ela encerra o ciclo quando a descarga
      // terminar, e não há tela para desfazer. "Com AG" abre a fase de
      // carga, que ainda passa pelo empilhador antes de fechar -- pedir
      // confirmação nas duas viraria clique automático, e aí nenhuma das
      // duas seria lida.
      onSubmit={
        retorno === "vazia"
          ? confirmarEnvio({
              titulo: "Confirmar que a carreta volta VAZIA?",
              detalhe:
                "Ela será finalizada assim que a descarga terminar, e não há como desfazer por aqui.",
              confirmar: "Sim, volta vazia",
              perigo: false,
            })
          : undefined
      }
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <p className="text-sm font-bold text-slate-800">🔄 A carreta vai levar AG na volta?</p>

      {/* Cada opção tem a PRÓPRIA cor, não a mesma cor de "selecionado".
          Com as duas em azul, o conferente confirmava no automático e só
          percebia a escolha errada depois. O roxo é o mesmo já usado nos
          blocos de "Retorno com AG" no resto da tela. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {(
          [
            {
              v: "vazia",
              titulo: "NÃO — volta vazia",
              ajuda: "Sai sem carga",
              emoji: "↩️",
              ativo: "border-slate-800 bg-slate-800 text-white",
            },
            {
              v: "com_ag",
              titulo: "SIM — volta com AG",
              ajuda: "Escolher destino e itens",
              emoji: "🔄",
              ativo: "border-purple-600 bg-purple-600 text-white",
            },
          ] as const
        ).map(({ v, titulo, ajuda, emoji, ativo }) => (
          <label
            key={v}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 px-3 py-4 text-center ${
              retorno === v ? ativo : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
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
            <span className="text-xl leading-none">{emoji}</span>
            <span className="text-sm font-bold">{titulo}</span>
            <span className={`text-xs ${retorno === v ? "opacity-80" : "text-slate-500"}`}>{ajuda}</span>
          </label>
        ))}
      </div>

      {retorno === "com_ag" && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div>
            <label className={rotulo} htmlFor="destino_retorno">Destino da carreta</label>
            {/* O destino grava o NOME da fábrica, não o id -- daí o
                usarRotuloComoValor. */}
            <SelectComCadastroRapido
              id="destino_retorno"
              name="destino_retorno"
              required
              placeholder="Escolha a fábrica de destino"
              opcoes={fabricas.map((f) => ({ valor: f.nome, rotulo: f.nome }))}
              usarRotuloComoValor
              criarRapido={podeEditarCatalogo ? criarFabricaRapida : undefined}
              campos={[{ nome: "nome", rotulo: "Nome da fábrica" }]}
              tituloCadastro="Nova fábrica"
            />
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
                  <div className="min-w-0 flex-1">
                    {i === 0 && <label className={rotulo}>AG</label>}
                    <SelectComCadastroRapido
                      name="ag_id"
                      required
                      placeholder="Escolha o AG"
                      opcoes={opcoesAg}
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
              <BotaoAdicionarLinha onClick={() => setItensAg((atual) => [...atual, novaChave()])}>
                Adicionar item de AG
              </BotaoAdicionarLinha>
            )}
          </div>
        </div>
      )}

      {/* O botão herda a cor da escolha: confirmar em azul, com a opção
          marcada em roxo ou preto, deixava o "confirmo o quê?" no ar. */}
      <BotaoEnviar
        textoEnviando="Confirmando..."
        className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm ${
          retorno === "com_ag" ? "bg-purple-600 hover:bg-purple-700" : "bg-slate-800 hover:bg-slate-900"
        }`}
      >
        {retorno === "com_ag" ? "🔄 Confirmar: volta com AG" : "↩️ Confirmar: volta vazia"}
      </BotaoEnviar>
    </form>
  );
}
