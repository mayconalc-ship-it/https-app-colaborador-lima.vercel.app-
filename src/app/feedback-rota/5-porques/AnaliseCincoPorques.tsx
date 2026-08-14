"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ArvoreDecisao, NoDecisao, RespostaPorque, Terminal } from "@/lib/cinco-porques-ia";
import { rotuloCategoria } from "@/lib/cinco-porques-problemas";
import { registrarResposta, expandirEFallback, finalizarAnalise } from "./actions";

const NIVEL_MAXIMO = 5;

type Opcao = NoDecisao["opcoes"][number];

/**
 * O wizard em si. Estado 100% local: cada toque numa opção com `terminal`
 * encerra ali mesmo, sem chamada nenhuma ao servidor -- é o caminho feliz
 * que cumpre a exigência de economia de tokens. Toque numa opção com
 * `proximo` avança localmente e só dispara `registrarResposta` (persistência
 * em segundo plano, não decisão). Só "Outro"/"Nenhuma dessas" chamam IA de
 * novo, via `expandirEFallback`.
 */
export function AnaliseCincoPorques({
  analiseId,
  problemaLabel,
  arvoreInicial,
  onRefazer,
}: {
  analiseId: number;
  problemaLabel: string;
  arvoreInicial: ArvoreDecisao;
  onRefazer: () => void;
}) {
  const [inicio] = useState(() => Date.now());
  const [noAtual, setNoAtual] = useState<NoDecisao>(arvoreInicial.raiz);
  const [respostas, setRespostas] = useState<RespostaPorque[]>([]);
  const [resultado, setResultado] = useState<Terminal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciarExpansao] = useTransition();
  const [concluindo, iniciarConclusao] = useTransition();
  const [concluida, setConcluida] = useState(false);

  function registrarEmSegundoPlano(resposta: RespostaPorque) {
    registrarResposta({ analiseId, resposta }).catch(() => {});
  }

  function escolherOpcao(opcao: Opcao) {
    setErro(null);
    const resposta: RespostaPorque = {
      nivel: noAtual.nivel,
      pergunta: noAtual.pergunta,
      opcaoId: opcao.id,
      opcaoLabel: opcao.label,
    };
    setRespostas((atual) => [...atual, resposta]);
    registrarEmSegundoPlano(resposta);

    if (opcao.terminal) {
      setResultado(opcao.terminal);
    } else if (opcao.proximo) {
      setNoAtual(opcao.proximo);
    }
  }

  function fallback(motivo: "outro_texto_livre" | "nenhuma_dessas", textoLivre?: string) {
    setErro(null);
    iniciarExpansao(async () => {
      const res = await expandirEFallback({
        analiseId,
        problemaLabel,
        respostas,
        nivelAtual: noAtual.nivel,
        motivo,
        textoLivre,
      });

      if (!res.ok) {
        setErro(res.erro);
        return;
      }

      const resposta: RespostaPorque = {
        nivel: noAtual.nivel,
        pergunta: noAtual.pergunta,
        opcaoId: motivo,
        opcaoLabel: motivo === "nenhuma_dessas" ? "Nenhuma dessas" : "Outro",
        textoLivre,
      };
      setRespostas((atual) => [...atual, resposta]);
      registrarEmSegundoPlano(resposta);

      if (res.terminal) {
        setResultado(res.terminal);
      } else if (res.proximoNo) {
        setNoAtual(res.proximoNo);
      } else {
        setErro("Não foi possível continuar a análise. Tente de novo.");
      }
    });
  }

  function concluir() {
    if (!resultado) return;
    iniciarConclusao(async () => {
      const res = await finalizarAnalise({
        analiseId,
        causaRaiz: resultado.causaRaiz,
        categoria: resultado.categoria,
        acaoSugerida: resultado.acaoSugerida,
        tempoMs: Date.now() - inicio,
      });
      if (res.ok) setConcluida(true);
      else setErro(res.erro);
    });
  }

  if (concluida) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-2 font-semibold text-green-800">Análise concluída!</p>
        <p className="mt-1 text-sm text-green-700">
          Obrigado. A liderança vai revisar e pode te dar um retorno.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Voltar ao menu
        </Link>
      </div>
    );
  }

  if (resultado) {
    return (
      <div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            🎯 Causa raiz
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">{resultado.causaRaiz}</p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            📂 Categoria
          </p>
          <p className="mt-1 text-sm text-slate-700">{rotuloCategoria(resultado.categoria)}</p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            💡 Ação sugerida
          </p>
          <p className="mt-1 text-sm text-slate-700">{resultado.acaoSugerida}</p>
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onRefazer}
            disabled={concluindo}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refazer análise
          </button>
          <button
            type="button"
            onClick={concluir}
            disabled={concluindo}
            aria-busy={concluindo}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {concluindo ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="rodinha" aria-hidden="true" />
                Enviando...
              </span>
            ) : (
              "Concluir análise"
            )}
          </button>
        </div>
      </div>
    );
  }

  const progresso = Math.min(Math.round((respostas.length / NIVEL_MAXIMO) * 100), 100);

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-slate-600">
            Porquê {noAtual.nivel} de até {NIVEL_MAXIMO}
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={respostas.length}
          aria-valuemin={0}
          aria-valuemax={NIVEL_MAXIMO}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-base font-semibold leading-snug text-slate-900">{noAtual.pergunta}</p>

        <div className="mt-4 space-y-2">
          {noAtual.opcoes.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              onClick={() => escolherOpcao(opcao)}
              disabled={carregando}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-800 transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
            >
              {opcao.label}
            </button>
          ))}

          <OpcaoOutro carregando={carregando} onEnviar={(texto) => fallback("outro_texto_livre", texto)} />

          <button
            type="button"
            onClick={() => fallback("nenhuma_dessas")}
            disabled={carregando}
            className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left text-sm text-slate-500 transition hover:border-slate-400 disabled:opacity-50"
          >
            {carregando ? "Analisando..." : "➕ Nenhuma dessas"}
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Outro" é o único lugar do wizard onde o motorista digita -- e mesmo
 *  assim só depois de tocar para abrir o campo. */
function OpcaoOutro({
  carregando,
  onEnviar,
}: {
  carregando: boolean;
  onEnviar: (texto: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={carregando}
        className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left text-sm text-slate-500 transition hover:border-slate-400 disabled:opacity-50"
      >
        ✏️ Outro motivo
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={120}
        placeholder="Descreva em poucas palavras..."
        className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={() => texto.trim() && onEnviar(texto.trim())}
        disabled={carregando || !texto.trim()}
        className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {carregando ? "Analisando..." : "Continuar"}
      </button>
    </div>
  );
}
