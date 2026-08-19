"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { atualizarAcao } from "@/app/5s/actions";
import {
  COR_PRIORIDADE,
  COR_STATUS_NC,
  ROTULO_PRIORIDADE,
  ROTULO_SENSO,
  ROTULO_STATUS_NC,
  diasAteOPrazo,
  estaAtrasada,
  type Prioridade,
  type Senso,
  type StatusNC,
} from "@/lib/cinco-s";

/**
 * Uma ação do plano, com a tratativa embutida.
 *
 * O detalhe abre no próprio cartão, e não em outra página, de
 * propósito: tratar uma ação é atualizar duas ou três coisas e anexar
 * uma foto -- navegar para longe e voltar, num celular, faz perder o
 * lugar na lista e desanima quem tem seis ações para despachar.
 *
 * Fechado, o cartão responde as três perguntas que importam: o que é,
 * de quem é, e quando vence.
 */

export type AcaoDados = {
  id: string;
  descricao: string;
  acao: string | null;
  senso: Senso;
  status: StatusNC;
  prioridade: Prioridade;
  prazo: string | null;
  responsavelNome: string | null;
  areaNome: string;
  auditoriaId: string;
  /** "4.3 Existem AUSÊNCIA cabos de energia..." — o item que reprovou. */
  pergunta: string | null;
  evidenciaUrl: string | null;
  evidenciaConclusaoUrl: string | null;
  comentarioEncerramento: string | null;
};

export function CartaoAcao({
  acao,
  souResponsavel,
  podeValidar,
  abertoInicial = false,
}: {
  acao: AcaoDados;
  souResponsavel: boolean;
  podeValidar: boolean;
  abertoInicial?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(abertoInicial);
  const [enviando, iniciar] = useTransition();

  const atrasada = estaAtrasada(acao.prazo, acao.status);
  const dias = diasAteOPrazo(acao.prazo);
  const encerrada = acao.status === "validada";

  function enviar(formData: FormData) {
    formData.set("id", acao.id);
    iniciar(async () => {
      const r = await atualizarAcao(formData);
      if (r.ok) {
        toast.sucesso(r.mensagem ?? "Ação atualizada.");
        setAberto(false);
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  /**
   * Só os passos que fazem sentido a partir de onde a ação está.
   *
   * Mostrar os quatro status sempre convidaria a pular etapa -- e
   * "concluída" antes de qualquer tratativa é o atalho que esvazia o
   * indicador de conclusão.
   */
  const proximos: { valor: StatusNC; rotulo: string; cor: string }[] = [];
  if (acao.status === "aberta") {
    proximos.push({
      valor: "em_andamento",
      rotulo: "Comecei a tratar",
      cor: "bg-amber-500",
    });
  }
  if (acao.status === "aberta" || acao.status === "em_andamento") {
    proximos.push({
      valor: "concluida",
      rotulo: "Concluir",
      cor: "bg-sky-600",
    });
  }
  if (acao.status === "concluida" && podeValidar) {
    proximos.push({ valor: "validada", rotulo: "Validar", cor: "bg-green-600" });
    proximos.push({
      valor: "em_andamento",
      rotulo: "Devolver",
      cor: "bg-slate-500",
    });
  }

  const podeMexer = souResponsavel || podeValidar;

  return (
    <li
      className={`rounded-2xl border bg-white shadow-sm ${
        atrasada ? "border-red-200" : "border-slate-200"
      }`}
    >
      {/* Div em vez de <button>: dentro de um botão o navegador não
          deixa selecionar texto com o mouse, e a descrição do problema
          é justamente o que a pessoa quer copiar para levar a outro
          lugar. O clique continua abrindo o cartão, só que ignora o
          toque que terminou em seleção -- senão arrastar para marcar o
          texto fecharia o cartão na cara de quem está copiando. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={aberto}
        onClick={() => {
          const selecionou = (window.getSelection()?.toString() ?? "").trim();
          if (selecionou) return;
          setAberto((a) => !a);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAberto((a) => !a);
          }
        }}
        className="w-full cursor-pointer p-4 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 select-text text-sm leading-snug text-slate-800">
            {acao.descricao}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_STATUS_NC[acao.status]}`}
          >
            {ROTULO_STATUS_NC[acao.status]}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
            {acao.areaNome}
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-500 ring-1 ring-slate-200">
            {ROTULO_SENSO[acao.senso]}
          </span>
          {acao.prioridade !== "media" && (
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${COR_PRIORIDADE[acao.prioridade]}`}
            >
              {ROTULO_PRIORIDADE[acao.prioridade]}
            </span>
          )}
          {acao.prazo && !encerrada && (
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${
                atrasada
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : dias !== null && dias <= 3
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : "bg-slate-50 text-slate-600 ring-slate-200"
              }`}
            >
              {atrasada
                ? `${Math.abs(dias ?? 0)} dia${Math.abs(dias ?? 0) === 1 ? "" : "s"} de atraso`
                : dias === 0
                  ? "vence hoje"
                  : `${dias} dia${dias === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-xs text-slate-400">
          {acao.responsavelNome ?? "Sem responsável definido"}
          <span className="float-right text-slate-300">{aberto ? "▴" : "▾"}</span>
        </p>
      </div>

      {aberto && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {/* Bloco pensado para ser SELECIONADO e copiado -- é daqui que
              a pessoa leva o problema para pedir sugestão em outro
              lugar. Por isso traz a pergunta original junto da
              observação do auditor: a descrição sozinha costuma ser só
              a anotação solta de quem estava na área, sem dizer qual
              item do checklist reprovou.

              Sem botão de copiar de propósito: o pedido foi poder
              marcar com o mouse, e um botão que copia um recorte fixo
              tira a escolha de quem está copiando. */}
          <div className="select-text rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Para copiar
            </p>
            {acao.pergunta && (
              <p className="mt-1 select-text text-sm leading-snug text-slate-700">
                <span className="font-semibold">Item {ROTULO_SENSO[acao.senso]}:</span>{" "}
                {acao.pergunta}
              </p>
            )}
            <p className="mt-1 select-text text-sm leading-snug text-slate-700">
              <span className="font-semibold">Área:</span> {acao.areaNome}
            </p>
            <p className="mt-1 select-text text-sm leading-snug text-slate-700">
              <span className="font-semibold">O que foi encontrado:</span>{" "}
              {acao.descricao}
            </p>
          </div>

          {acao.evidenciaUrl && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Evidência do problema
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={acao.evidenciaUrl}
                alt="Evidência registrada na auditoria"
                loading="lazy"
                decoding="async"
                className="h-40 w-full rounded-xl object-cover"
              />
            </div>
          )}

          {acao.acao && (
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ação corretiva
              </p>
              <p className="text-sm text-slate-600">{acao.acao}</p>
            </div>
          )}

          {acao.evidenciaConclusaoUrl && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Evidência da solução
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={acao.evidenciaConclusaoUrl}
                alt="Evidência da solução"
                loading="lazy"
                decoding="async"
                className="h-40 w-full rounded-xl object-cover"
              />
            </div>
          )}

          {acao.comentarioEncerramento && (
            <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-500">
              {acao.comentarioEncerramento}
            </p>
          )}

          <Link
            href={`/5s/auditoria/${acao.auditoriaId}`}
            className="inline-block text-xs font-semibold text-primary underline"
          >
            Ver a auditoria de origem
          </Link>

          {encerrada ? (
            <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
              Ação validada e encerrada.
            </p>
          ) : !podeMexer ? (
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Acompanhando. Quem trata esta ação é{" "}
              {acao.responsavelNome ?? "o responsável designado"}.
            </p>
          ) : (
            <form action={enviar} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  O que foi feito
                </label>
                <textarea
                  name="acao"
                  rows={2}
                  defaultValue={acao.acao ?? ""}
                  placeholder="Descreva a ação tomada"
                  className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Foto da solução
                </label>
                <input
                  type="file"
                  name="evidencia"
                  accept="image/*"
                  capture="environment"
                  className="w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Comentário
                </label>
                <input
                  name="comentario"
                  placeholder="Opcional — fica no histórico"
                  className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {proximos.map((n) => (
                  <button
                    key={`${n.valor}-${n.rotulo}`}
                    type="submit"
                    name="status"
                    value={n.valor}
                    disabled={enviando}
                    className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${n.cor}`}
                  >
                    {enviando ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span className="rodinha" aria-hidden="true" />
                        Salvando...
                      </span>
                    ) : (
                      n.rotulo
                    )}
                  </button>
                ))}
              </div>

              {acao.status === "concluida" && !podeValidar && (
                <p className="text-xs text-slate-400">
                  Concluída — aguardando a conferência de quem apontou o
                  problema.
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </li>
  );
}
