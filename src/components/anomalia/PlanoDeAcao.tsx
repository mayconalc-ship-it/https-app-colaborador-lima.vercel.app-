"use client";

import { useState } from "react";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import {
  ROTULO_STATUS_ACAO,
  ROTULO_TOPICO,
  STATUS_ACAO,
  TOPICOS_ACAO,
  type StatusAcao,
  type TopicoAcao,
} from "@/lib/relato-anomalia";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

export type LinhaDoPlano = {
  topico: TopicoAcao;
  oQue: string;
  como: string;
  quem: string;
  prazo: string;
  status: StatusAcao;
};

let contador = 0;
const novaChave = () => `acao-${(contador += 1)}`;

/**
 * O PLANO DE AÇÃO -- as linhas do papel, editáveis.
 *
 * Faz parte do MESMO formulário do relato: os campos saem como listas
 * paralelas (`acao_topico`, `acao_o_que`...), que é como o HTML manda
 * campos repetidos, e o servidor reescreve o plano inteiro. Um formulário
 * por linha faria a pessoa salvar cinco vezes para escrever um plano.
 *
 * A LINHA NOVA JÁ NASCE COM O TÓPICO CERTO. Enquanto não houver ação de
 * causa raiz, a próxima linha sugere "causa raiz" -- é a que o
 * fechamento exige e a que costuma faltar. Plano só com ação corretiva
 * apaga o incêndio e garante o próximo, e esse é o achado mais comum de
 * auditoria em plano de ação.
 */
export function PlanoDeAcao({
  iniciais,
  somenteLeitura = false,
}: {
  iniciais: LinhaDoPlano[];
  somenteLeitura?: boolean;
}) {
  const [linhas, setLinhas] = useState(() =>
    (iniciais.length > 0
      ? iniciais
      : [{ topico: "corretiva" as TopicoAcao, oQue: "", como: "", quem: "", prazo: "", status: "pendente" as StatusAcao }]
    ).map((l) => ({ ...l, chave: novaChave() })),
  );

  const temCausaRaiz = linhas.some((l) => l.topico === "causa_raiz");

  function mudar(chave: string, campoNome: keyof LinhaDoPlano, valor: string) {
    setLinhas((atual) =>
      atual.map((l) => (l.chave === chave ? { ...l, [campoNome]: valor } : l)),
    );
  }

  return (
    <div className="space-y-3">
      {linhas.map((l, i) => (
        <div
          key={l.chave}
          className="acao-do-plano rounded-xl border border-slate-200 bg-slate-50/60 p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500">Ação {i + 1}</span>
            {!somenteLeitura && linhas.length > 1 && (
              <button
                type="button"
                onClick={() => setLinhas((a) => a.filter((x) => x.chave !== l.chave))}
                className="so-na-tela text-xs font-semibold text-red-600 hover:underline"
              >
                Remover
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className={rotulo}>Tópico</label>
              <select
                name="acao_topico"
                value={l.topico}
                onChange={(e) => mudar(l.chave, "topico", e.target.value)}
                disabled={somenteLeitura}
                className={campo}
              >
                {TOPICOS_ACAO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TOPICO[t].titulo}
                  </option>
                ))}
              </select>
              <p className="so-na-tela mt-1 text-[11px] leading-tight text-slate-400">
                {ROTULO_TOPICO[l.topico].ajuda}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={rotulo}>O quê? *</label>
              <textarea
                name="acao_o_que"
                value={l.oQue}
                onChange={(e) => mudar(l.chave, "oQue", e.target.value)}
                readOnly={somenteLeitura}
                rows={2}
                className={campo}
                placeholder="A ação, em uma frase."
              />
            </div>
          </div>

          <div className="mt-2">
            <label className={rotulo}>Como?</label>
            <textarea
              name="acao_como"
              value={l.como}
              onChange={(e) => mudar(l.chave, "como", e.target.value)}
              readOnly={somenteLeitura}
              rows={2}
              className={campo}
              placeholder="O meio. É o campo que separa intenção de plano."
            />
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <label className={rotulo}>Quem? *</label>
              <input
                name="acao_quem"
                value={l.quem}
                onChange={(e) => mudar(l.chave, "quem", e.target.value)}
                readOnly={somenteLeitura}
                className={campo}
                placeholder="Uma pessoa — área não assina."
              />
            </div>
            <div>
              <label className={rotulo}>Prazo *</label>
              <input
                type="date"
                name="acao_prazo"
                value={l.prazo}
                onChange={(e) => mudar(l.chave, "prazo", e.target.value)}
                readOnly={somenteLeitura}
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Status</label>
              <select
                name="acao_status"
                value={l.status}
                onChange={(e) => mudar(l.chave, "status", e.target.value)}
                disabled={somenteLeitura}
                className={campo}
              >
                {STATUS_ACAO.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_ACAO[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}

      {!somenteLeitura && (
        <div className="so-na-tela">
          <BotaoAdicionarLinha
            onClick={() =>
              setLinhas((a) => [
                ...a,
                {
                  chave: novaChave(),
                  // Sugere o que falta: enquanto não houver causa raiz, é
                  // ela que a próxima linha propõe.
                  topico: (temCausaRaiz ? "corretiva" : "causa_raiz") as TopicoAcao,
                  oQue: "",
                  como: "",
                  quem: "",
                  prazo: "",
                  status: "pendente" as StatusAcao,
                },
              ])
            }
          >
            Adicionar ação
          </BotaoAdicionarLinha>
          {!temCausaRaiz && (
            <p className="mt-1.5 text-xs font-medium text-amber-700">
              ⚠️ Falta uma ação de <strong>causa raiz</strong>. Só ação corretiva apaga o incêndio e
              garante o próximo — o relato não fecha sem ela.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
