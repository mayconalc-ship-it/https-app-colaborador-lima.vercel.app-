"use client";

import { useEffect, useState } from "react";
import { SelecaoProblema } from "./SelecaoProblema";
import { AnaliseCincoPorques } from "./AnaliseCincoPorques";
import { iniciarAnalise, retomarAnalise } from "./actions";
import type { NoDecisao, RespostaPorque, Terminal } from "@/lib/cinco-porques-ia";

type AnaliseIniciada = {
  analiseId: number;
  problemaLabel: string;
  primeiroNo: NoDecisao;
  /** Só na retomada: a trilha já gravada e, se houver, a causa raiz. */
  respostasIniciais?: RespostaPorque[];
  resultadoInicial?: Terminal | null;
};

/**
 * Dono do estado do fluxo inteiro. Quando o feedback já tem contexto
 * (nota ruim, ocorrências marcadas ou comentário), pula a seleção manual
 * de problema e já entra direto na árvore, usando esse contexto -- é o
 * "não repetir o que já contou" pedido no fluxo. Sem contexto (ex.: rota
 * boa, sem comentário), cai na seleção manual normal.
 *
 * RETOMADA (14/09/2026): se este feedback já tem uma análise parada no
 * meio, ela continua de onde ficou em vez de nascer outra -- é para onde
 * leva o lembrete de "5 Porquês pela metade". Sem isso, o lembrete abriria
 * uma análise nova e deixaria a antiga parada para sempre.
 */
export function FluxoCincoPorques({
  feedbackRotaId,
  rota,
  problemaAuto,
  retomarAnaliseId = null,
}: {
  feedbackRotaId: number;
  rota: string | null;
  problemaAuto: string | null;
  retomarAnaliseId?: number | null;
}) {
  const [iniciada, setIniciada] = useState<AnaliseIniciada | null>(null);
  const [usarSelecaoManual, setUsarSelecaoManual] = useState(!problemaAuto);
  const [retomar, setRetomar] = useState<number | null>(retomarAnaliseId);
  const [chave, setChave] = useState(0);

  function refazer() {
    setIniciada(null);
    setRetomar(null);
    // Refazer sempre volta para a escolha manual: se o caminho automático
    // não ajudou, faz mais sentido deixar o motorista escolher de novo do
    // que repetir a mesma árvore com o mesmo contexto.
    setUsarSelecaoManual(true);
    setChave((c) => c + 1);
  }

  if (iniciada) {
    return (
      <AnaliseCincoPorques
        key={chave}
        analiseId={iniciada.analiseId}
        problemaLabel={iniciada.problemaLabel}
        primeiroNo={iniciada.primeiroNo}
        respostasIniciais={iniciada.respostasIniciais}
        resultadoInicial={iniciada.resultadoInicial}
        onRefazer={refazer}
      />
    );
  }

  if (retomar !== null) {
    return (
      <Retomada
        analiseId={retomar}
        onIniciar={setIniciada}
        onFalhar={() => setRetomar(null)}
      />
    );
  }

  if (usarSelecaoManual) {
    return (
      <SelecaoProblema
        feedbackRotaId={feedbackRotaId}
        rota={rota}
        onIniciar={setIniciada}
      />
    );
  }

  return (
    <InicioAutomatico
      feedbackRotaId={feedbackRotaId}
      rota={rota}
      problemaLabel={problemaAuto!}
      onIniciar={setIniciada}
      onFalhar={() => setUsarSelecaoManual(true)}
    />
  );
}

/** Retoma a análise parada: busca a próxima pergunta a partir da trilha
 *  gravada, sem pedir para o motorista tocar em nada. */
function Retomada({
  analiseId,
  onIniciar,
  onFalhar,
}: {
  analiseId: number;
  onIniciar: (dados: AnaliseIniciada) => void;
  onFalhar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    retomarAnalise(analiseId).then((resultado) => {
      if (cancelado) return;
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      onIniciar({
        analiseId,
        problemaLabel: resultado.problemaLabel,
        // Quando a IA já devolve a causa raiz, não há próxima pergunta: a
        // tela abre direto no resultado e esta pergunta vazia nunca aparece.
        primeiroNo: resultado.proximoNo ?? {
          nivel: resultado.respostas.length + 1,
          pergunta: "",
          opcoes: [],
        },
        respostasIniciais: resultado.respostas,
        resultadoInicial: resultado.terminal ?? null,
      });
    });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erro) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-red-700">{erro}</p>
        <button
          type="button"
          onClick={onFalhar}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Começar uma nova análise
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <span className="rodinha mx-auto block text-2xl text-primary" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">
        🧠 Continuando de onde você parou...
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Suas respostas anteriores estão guardadas.
      </p>
    </div>
  );
}

/** Dispara a 1ª chamada de IA assim que a tela abre, usando o que o
 *  motorista já contou no feedback -- sem pedir pra ele tocar em nada. */
function InicioAutomatico({
  feedbackRotaId,
  rota,
  problemaLabel,
  onIniciar,
  onFalhar,
}: {
  feedbackRotaId: number;
  rota: string | null;
  problemaLabel: string;
  onIniciar: (dados: AnaliseIniciada) => void;
  onFalhar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    iniciarAnalise({
      problemaId: "feedback_rota",
      problemaLabel,
      rota: rota ?? undefined,
      feedbackRotaId,
    }).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok) {
        onIniciar({
          analiseId: resultado.analiseId,
          problemaLabel,
          primeiroNo: resultado.primeiroNo,
        });
      } else {
        setErro(resultado.erro);
      }
    });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erro) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-red-700">{erro}</p>
        <button
          type="button"
          onClick={onFalhar}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Escolher o problema manualmente
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <span className="rodinha mx-auto block text-2xl text-primary" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">
        🧠 Vamos encontrar a causa raiz...
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Analisando o que você contou no feedback da rota.
      </p>
    </div>
  );
}
