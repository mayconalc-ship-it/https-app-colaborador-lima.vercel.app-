"use client";

import { useState, useTransition } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { responderItem } from "./actions";

export type ItemChecklist = {
  id: string;
  pergunta: string;
  ajuda: string | null;
  grupo: string | null;
};

export type RespostaGravada = {
  resposta: "ok" | "nok" | "na";
  observacao: string | null;
  foto_url: string | null;
};

const ROTULO = { ok: "OK", nok: "NOK", na: "N/A" } as const;

/**
 * UM ITEM DO CHECKLIST -- OK em um toque, NOK com evidência.
 *
 * O OK É A MAIORIA, e por isso é um toque só, sem campo nenhum. Se cada
 * item pedisse observação, o conferente aprenderia a marcar tudo OK para
 * chegar ao fim -- que é como um checklist vira carimbo.
 *
 * O NOK ABRE A EVIDÊNCIA e não fecha sem ela. A foto é exigida na tela, na
 * ação de servidor e no banco (migration 100), nesta ordem: a tela para
 * explicar, a ação para valer, o banco para nunca entrar por outro
 * caminho.
 *
 * O OK/N/A vai por `useTransition`, e não por `<form action>`: assim o
 * botão pinta na hora do toque, antes da volta do servidor. Na doca essa
 * volta demora, e um botão que não responde é um botão que a pessoa
 * aperta de novo.
 */
export function ItemDaBlitz({
  item,
  gravada,
  atendimentoId,
  blitzId,
  somenteLeitura = false,
}: {
  item: ItemChecklist;
  gravada: RespostaGravada | null;
  atendimentoId: string;
  blitzId: string;
  somenteLeitura?: boolean;
}) {
  // A escolha da tela ganha da gravada enquanto o servidor não volta --
  // e é ela que decide se o painel da foto está aberto.
  const [escolha, setEscolha] = useState<"ok" | "nok" | "na" | null>(null);
  const [enviando, transicionar] = useTransition();

  const atual = escolha ?? gravada?.resposta ?? null;
  const respondida = gravada !== null;
  const jaTemFoto = Boolean(gravada?.foto_url);

  function responder(valor: "ok" | "na") {
    setEscolha(valor);
    const dados = new FormData();
    dados.set("atendimento_id", atendimentoId);
    dados.set("blitz_id", blitzId);
    dados.set("item_id", item.id);
    dados.set("pergunta", item.pergunta);
    dados.set("resposta", valor);
    transicionar(async () => {
      await responderItem(dados);
    });
  }

  return (
    <li
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        atual === "nok"
          ? "border-red-300 ring-1 ring-red-100"
          : respondida
            ? "border-slate-200"
            : "border-amber-300"
      }`}
    >
      <p className="text-sm font-semibold leading-snug text-slate-900">{item.pergunta}</p>
      {/* O QUE OLHAR, embaixo da pergunta. Sem isso dois conferentes marcam
          NOK por critérios diferentes e o histórico deixa de comparar. */}
      {item.ajuda && <p className="mt-1 text-xs leading-snug text-slate-500">{item.ajuda}</p>}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["ok", "nok", "na"] as const).map((v) => {
          const ativo = atual === v;
          const cores = {
            ok: ativo ? "bg-green-600 text-white ring-green-600" : "text-green-700 ring-green-200",
            nok: ativo ? "bg-red-600 text-white ring-red-600" : "text-red-700 ring-red-200",
            na: ativo ? "bg-slate-600 text-white ring-slate-600" : "text-slate-500 ring-slate-200",
          }[v];
          return (
            <button
              key={v}
              type="button"
              disabled={somenteLeitura || enviando}
              // O NOK só ABRE o painel da evidência; quem grava é o
              // "Salvar NOK" depois da foto.
              onClick={() => (v === "nok" ? setEscolha("nok") : responder(v))}
              aria-pressed={ativo}
              className={`rounded-xl py-3 text-sm font-bold ring-1 transition-colors disabled:opacity-60 ${cores}`}
            >
              {ROTULO[v]}
            </button>
          );
        })}
      </div>

      {atual === "nok" && !somenteLeitura && (
        <form action={responderItem} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="atendimento_id" value={atendimentoId} />
          <input type="hidden" name="blitz_id" value={blitzId} />
          <input type="hidden" name="item_id" value={item.id} />
          <input type="hidden" name="pergunta" value={item.pergunta} />
          <input type="hidden" name="resposta" value="nok" />

          <label className="block text-xs font-semibold text-red-700">
            Foto da não conformidade {!jaTemFoto && "— obrigatória"}
          </label>
          <input
            type="file"
            name="foto"
            accept="image/*"
            // Abre a câmera direto no celular: a evidência é tirada ali, na
            // carreta, e não escolhida depois numa galeria.
            capture="environment"
            required={!jaTemFoto}
            className="w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-red-700"
          />

          {gravada?.foto_url && (
            <FotoEvidencia
              src={gravada.foto_url}
              alt={`Evidência de ${item.pergunta}`}
              classeCaixa="h-28 w-full"
            />
          )}

          <textarea
            name="observacao"
            rows={2}
            defaultValue={gravada?.observacao ?? ""}
            placeholder="O que foi encontrado. Esta frase vai no relato ao transportador."
            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-primary focus:outline-none"
          />

          <BotaoEnviar
            textoEnviando="Salvando..."
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white active:bg-red-700"
          >
            {gravada?.resposta === "nok" ? "Atualizar o NOK" : "Salvar NOK com evidência"}
          </BotaoEnviar>
        </form>
      )}

      {gravada?.resposta === "nok" && atual === "nok" && (
        <p className="mt-2 text-xs font-semibold text-red-700">🚨 NOK registrado com evidência.</p>
      )}
      {respondida && atual !== "nok" && (
        <p className="mt-2 text-xs font-semibold text-green-700">
          ✅ Respondido: {ROTULO[gravada.resposta]}
        </p>
      )}
    </li>
  );
}
