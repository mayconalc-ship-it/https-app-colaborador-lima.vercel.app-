"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { finalizarAuditoria, salvarResposta } from "@/app/5s/actions";
import {
  BOTAO_RESPOSTA,
  EMOJI_SENSO,
  JAPONES_SENSO,
  ROTULO_SENSO,
  SENSOS,
  formatarTaxa,
  taxaConformidade,
  type Pergunta,
  type Resposta,
  type RespostaSalva,
  type Senso,
} from "@/lib/cinco-s";

/**
 * O checklist 5S, feito para ser respondido andando pela área com o
 * celular na mão.
 *
 * Três decisões mandam no desenho:
 *
 * 1) UM SENSO POR VEZ. Vinte e cinco perguntas numa página só viram
 *    uma rolagem em que ninguém sabe onde parou. Cinco telas de quatro
 *    a seis perguntas cabem na mão e dão um fim visível a cada etapa.
 *
 * 2) SALVA A CADA TOQUE. A auditoria acontece no fundo do armazém, onde
 *    o sinal cai. Um "Enviar" no fim significaria perder as vinte e
 *    cinco respostas de uma vez. Aqui, cada resposta já está no banco
 *    antes de a pessoa dar o próximo passo.
 *
 * 3) O DEDO ANTES DO OLHO. Os três botões ocupam a largura toda e têm
 *    altura de alvo de toque de verdade -- não são rádio-buttons de
 *    formulário de desktop encolhidos para caber.
 */

type Props = {
  auditoriaId: string;
  areaNome: string;
  perguntas: Pergunta[];
  respostasIniciais: RespostaSalva[];
  /** Já finalizada: a tela vira só leitura. */
  somenteLeitura: boolean;
};

export function Checklist({
  auditoriaId,
  areaNome,
  perguntas,
  respostasIniciais,
  somenteLeitura,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [salvando, iniciarSalvamento] = useTransition();

  const [respostas, setRespostas] = useState(() => {
    const m = new Map<string, RespostaSalva>();
    for (const r of respostasIniciais) m.set(r.pergunta_id, r);
    return m;
  });

  const porSenso = useMemo(() => {
    const m = new Map<Senso, Pergunta[]>();
    for (const s of SENSOS) m.set(s, []);
    for (const p of perguntas) m.get(p.senso)?.push(p);
    // Senso sem pergunta ativa não vira etapa vazia.
    return SENSOS.filter((s) => (m.get(s)?.length ?? 0) > 0).map((s) => ({
      senso: s,
      perguntas: m.get(s)!,
    }));
  }, [perguntas]);

  const [etapa, setEtapa] = useState(() => {
    // Abre na primeira etapa que ainda tem pergunta em branco -- quem
    // voltou depois de uma interrupção continua de onde parou, sem
    // precisar procurar.
    const respondidas = new Set(respostasIniciais.map((r) => r.pergunta_id));
    const grupos = SENSOS.filter((s) =>
      perguntas.some((p) => p.senso === s),
    ).map((s) => perguntas.filter((p) => p.senso === s));
    const i = grupos.findIndex((g) => g.some((p) => !respondidas.has(p.id)));
    return i === -1 ? grupos.length : i;
  });

  /**
   * Marca em vermelho os itens sem resposta.
   *
   * Só liga quando a pessoa TENTA avançar. Ligado desde o início, o
   * senso inteiro nasceria vermelho -- e um aviso que aparece antes de
   * existir erro deixa de ser lido.
   */
  const [destacarPendentes, setDestacarPendentes] = useState(false);

  const total = perguntas.length;
  const respondidas = respostas.size;
  const progresso = total > 0 ? Math.round((respondidas / total) * 100) : 0;
  const noResumo = etapa >= porSenso.length;

  const contagem = useMemo(() => {
    let ok = 0;
    let nok = 0;
    let na = 0;
    for (const r of respostas.values()) {
      if (r.valor === "sim") ok++;
      else if (r.valor === "nao") nok++;
      else na++;
    }
    return { ok, nok, na };
  }, [respostas]);

  function responder(pergunta: Pergunta, valor: Resposta) {
    if (somenteLeitura) return;

    const anterior = respostas.get(pergunta.id);

    // Otimista: o botão pinta na hora. A auditoria é uma sequência
    // rápida de toques, e esperar a rede a cada um faria a tela parecer
    // travada mesmo funcionando.
    setRespostas((m) => {
      const novo = new Map(m);
      novo.set(pergunta.id, {
        pergunta_id: pergunta.id,
        valor,
        observacao: anterior?.observacao ?? null,
        foto_url: anterior?.foto_url ?? null,
      });
      return novo;
    });

    const dados = new FormData();
    dados.set("auditoria_id", auditoriaId);
    dados.set("pergunta_id", pergunta.id);
    dados.set("valor", valor);
    if (anterior?.observacao) dados.set("observacao", anterior.observacao);

    iniciarSalvamento(async () => {
      const r = await salvarResposta(dados);
      if (!r.ok) {
        // Desfaz o otimismo: mostrar respondido o que o banco recusou
        // faria a pessoa finalizar achando que gravou.
        setRespostas((m) => {
          const novo = new Map(m);
          if (anterior) novo.set(pergunta.id, anterior);
          else novo.delete(pergunta.id);
          return novo;
        });
        toast.erro(r.erro);
      }
    });
  }

  function salvarDetalhe(pergunta: Pergunta, formData: FormData) {
    if (somenteLeitura) return;
    const atual = respostas.get(pergunta.id);
    if (!atual) {
      toast.erro("Responda o item antes de detalhar.");
      return;
    }

    formData.set("auditoria_id", auditoriaId);
    formData.set("pergunta_id", pergunta.id);
    formData.set("valor", atual.valor);

    const observacao = String(formData.get("observacao") ?? "").trim();

    iniciarSalvamento(async () => {
      const r = await salvarResposta(formData);
      if (r.ok) {
        setRespostas((m) => {
          const novo = new Map(m);
          novo.set(pergunta.id, { ...atual, observacao: observacao || null });
          return novo;
        });
        toast.sucesso("Detalhe salvo.");
      } else {
        toast.erro(r.erro);
      }
    });
  }

  /** As perguntas do senso aberto que ainda estão sem resposta. */
  const pendentesDoSenso = noResumo
    ? []
    : porSenso[etapa].perguntas.filter((p) => !respostas.has(p.id));

  /**
   * Avançar exige o senso completo.
   *
   * O bloqueio é aqui E no servidor: `finalizarAuditoria` recusa a
   * auditoria incompleta de novo, porque esta tela é só a tela -- e a
   * ação de servidor pode ser chamada sem passar por ela.
   *
   * Em vez de um botão desligado, que não explica nada, o botão avisa
   * quantos faltam, pinta os pendentes e leva a pessoa até o primeiro
   * deles. Botão morto no celular passa por tela travada.
   */
  function avancar() {
    if (pendentesDoSenso.length > 0) {
      setDestacarPendentes(true);
      toast.erro(
        pendentesDoSenso.length === 1
          ? "Falta responder 1 item deste senso."
          : `Faltam responder ${pendentesDoSenso.length} itens deste senso.`,
      );
      document
        .getElementById(`item-${pendentesDoSenso[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setDestacarPendentes(false);
    setEtapa((e) => e + 1);
  }

  function finalizar() {
    iniciarSalvamento(async () => {
      const r = await finalizarAuditoria(auditoriaId);
      if (r.ok) {
        toast.sucesso(r.mensagem ?? "Auditoria finalizada.");
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <div className="pb-28">
      {/* ---- Barra de progresso, sempre visível ---- */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
            {areaNome}
          </p>
          <p className="shrink-0 text-xs tabular-nums text-slate-500">
            {respondidas} de {total}
          </p>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {noResumo
            ? "Revisão final"
            : `Senso ${etapa + 1} de ${porSenso.length} · ${
                total - respondidas
              } ${total - respondidas === 1 ? "pergunta" : "perguntas"} para responder`}
        </p>
      </div>

      {noResumo ? (
        <Resumo
          contagem={contagem}
          total={total}
          respondidas={respondidas}
          somenteLeitura={somenteLeitura}
          salvando={salvando}
          onVoltar={() => setEtapa(porSenso.length - 1)}
          onFinalizar={finalizar}
          onIrPara={(s) => {
            const i = porSenso.findIndex((g) => g.senso === s);
            if (i >= 0) setEtapa(i);
          }}
          porSenso={porSenso.map((g) => ({
            senso: g.senso,
            faltam: g.perguntas.filter((p) => !respostas.has(p.id)).length,
            nok: g.perguntas.filter((p) => respostas.get(p.id)?.valor === "nao")
              .length,
          }))}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">
              {EMOJI_SENSO[porSenso[etapa].senso]}
            </span>
            <div>
              <h2 className="text-lg font-bold leading-tight text-slate-900">
                {ROTULO_SENSO[porSenso[etapa].senso]}
              </h2>
              <p className="text-xs text-slate-400">
                {JAPONES_SENSO[porSenso[etapa].senso]} ·{" "}
                {porSenso[etapa].perguntas.length} itens
              </p>
            </div>
          </div>

          <ul className="space-y-3">
            {porSenso[etapa].perguntas.map((p) => (
              <ItemPergunta
                key={p.id}
                pergunta={p}
                resposta={respostas.get(p.id)}
                somenteLeitura={somenteLeitura}
                pendente={destacarPendentes && !respostas.has(p.id)}
                onResponder={(v) => responder(p, v)}
                onDetalhe={(fd) => salvarDetalhe(p, fd)}
              />
            ))}
          </ul>
        </>
      )}

      {/* ---- Navegação fixa no rodapé, na altura do polegar ---- */}
      {!noResumo && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-2xl gap-2">
            <button
              type="button"
              onClick={() => {
                setDestacarPendentes(false);
                setEtapa((e) => Math.max(0, e - 1));
              }}
              disabled={etapa === 0}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              onClick={avancar}
              aria-disabled={pendentesDoSenso.length > 0}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white ${
                pendentesDoSenso.length > 0
                  ? "bg-slate-300"
                  : "bg-primary active:bg-primary-dark"
              }`}
            >
              {pendentesDoSenso.length > 0
                ? `Faltam ${pendentesDoSenso.length} ${
                    pendentesDoSenso.length === 1 ? "item" : "itens"
                  } neste senso`
                : etapa === porSenso.length - 1
                  ? "Revisar e finalizar"
                  : `Próximo: ${ROTULO_SENSO[porSenso[etapa + 1].senso]}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ItemPergunta({
  pergunta,
  resposta,
  somenteLeitura,
  pendente,
  onResponder,
  onDetalhe,
}: {
  pergunta: Pergunta;
  resposta?: RespostaSalva;
  somenteLeitura: boolean;
  /** Ficou sem resposta e a pessoa tentou avançar. */
  pendente: boolean;
  onResponder: (v: Resposta) => void;
  onDetalhe: (fd: FormData) => void;
}) {
  // O detalhe abre sozinho quando o item é NOK: descrever o problema
  // deixa de ser opcional escondido atrás de um clique e passa a ser o
  // próximo passo natural -- é dessa descrição que nasce o plano de ação.
  const [aberto, setAberto] = useState(false);
  const mostrarDetalhe = aberto || resposta?.valor === "nao";

  return (
    <li
      id={`item-${pergunta.id}`}
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        pendente
          ? "border-red-300 ring-2 ring-red-100"
          : "border-slate-200"
      }`}
    >
      <p className="text-sm leading-snug text-slate-700">
        <span className="font-bold text-slate-900">{pergunta.codigo}</span>{" "}
        {pergunta.texto}
      </p>
      {pendente && (
        <p className="mt-1 text-xs font-semibold text-red-600">
          Falta responder este item.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["sim", "nao", "na"] as Resposta[]).map((v) => {
          const ativo = resposta?.valor === v;
          const cores: Record<Resposta, string> = {
            sim: ativo
              ? "bg-green-600 text-white ring-green-600"
              : "text-green-700 ring-green-200 hover:bg-green-50",
            nao: ativo
              ? "bg-red-600 text-white ring-red-600"
              : "text-red-700 ring-red-200 hover:bg-red-50",
            na: ativo
              ? "bg-slate-600 text-white ring-slate-600"
              : "text-slate-500 ring-slate-200 hover:bg-slate-50",
          };
          return (
            <button
              key={v}
              type="button"
              disabled={somenteLeitura}
              onClick={() => onResponder(v)}
              aria-pressed={ativo}
              className={`rounded-xl py-3 text-sm font-bold ring-1 transition-colors disabled:opacity-60 ${cores[v]}`}
            >
              {BOTAO_RESPOSTA[v]}
            </button>
          );
        })}
      </div>

      {!somenteLeitura && !mostrarDetalhe && resposta && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-2 text-xs font-medium text-primary underline"
        >
          + observação ou foto
        </button>
      )}

      {mostrarDetalhe && (
        <form
          action={onDetalhe}
          className="mt-3 space-y-2 border-t border-slate-100 pt-3"
        >
          <textarea
            name="observacao"
            rows={2}
            defaultValue={resposta?.observacao ?? ""}
            disabled={somenteLeitura}
            placeholder={
              resposta?.valor === "nao"
                ? "O que está errado? Esse texto vira a descrição do plano de ação."
                : "Observação (opcional)"
            }
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none disabled:bg-slate-50"
          />

          {resposta?.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resposta.foto_url}
              alt="Evidência registrada"
              loading="lazy"
              decoding="async"
              className="h-24 w-full rounded-xl object-cover"
            />
          )}

          {!somenteLeitura && (
            <div className="flex items-center gap-2">
              <input
                type="file"
                name="foto"
                accept="image/*"
                // capture abre a câmera direto no celular, em vez da
                // galeria: a evidência do 5S é tirada na hora, ali.
                capture="environment"
                className="min-w-0 flex-1 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
              />
              <BotaoEnviar
                textoEnviando="Salvando..."
                className="shrink-0 rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-white active:bg-slate-800"
              >
                Salvar
              </BotaoEnviar>
            </div>
          )}
        </form>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function Resumo({
  contagem,
  total,
  respondidas,
  somenteLeitura,
  salvando,
  porSenso,
  onVoltar,
  onFinalizar,
  onIrPara,
}: {
  contagem: { ok: number; nok: number; na: number };
  total: number;
  respondidas: number;
  somenteLeitura: boolean;
  salvando: boolean;
  porSenso: { senso: Senso; faltam: number; nok: number }[];
  onVoltar: () => void;
  onFinalizar: () => void;
  onIrPara: (s: Senso) => void;
}) {
  const faltam = total - respondidas;
  const taxa = taxaConformidade(contagem.ok, contagem.nok);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Conformidade parcial
        </p>
        <p className="text-4xl font-bold text-primary">{formatarTaxa(taxa)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {contagem.ok} conformes · {contagem.nok} não conformes ·{" "}
          {contagem.na} não se aplicam
        </p>
      </div>

      <ul className="space-y-2">
        {porSenso.map((s) => (
          <li key={s.senso}>
            <button
              type="button"
              onClick={() => onIrPara(s.senso)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">{EMOJI_SENSO[s.senso]}</span>
                <span className="truncate text-sm font-medium text-slate-700">
                  {ROTULO_SENSO[s.senso]}
                </span>
              </span>
              <span className="shrink-0 text-xs">
                {s.faltam > 0 ? (
                  <span className="font-semibold text-amber-600">
                    faltam {s.faltam}
                  </span>
                ) : s.nok > 0 ? (
                  <span className="font-semibold text-red-600">
                    {s.nok} NOK
                  </span>
                ) : (
                  <span className="font-semibold text-green-600">tudo OK</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {contagem.nok > 0 && !somenteLeitura && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          Ao finalizar, os <strong>{contagem.nok}</strong> itens não conformes
          viram ações no Plano de Ação 5S, já atribuídas ao dono da área com
          prazo de 30 dias. Você ajusta responsável e prazo depois.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
        >
          ←
        </button>
        {!somenteLeitura && (
          <button
            type="button"
            onClick={onFinalizar}
            disabled={faltam > 0 || salvando}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark disabled:bg-slate-300"
          >
            {salvando ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="rodinha" aria-hidden="true" />
                Finalizando...
              </span>
            ) : faltam > 0 ? (
              `Faltam ${faltam} ${faltam === 1 ? "pergunta" : "perguntas"}`
            ) : (
              "Finalizar auditoria"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
