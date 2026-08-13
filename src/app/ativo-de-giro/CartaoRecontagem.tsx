"use client";

import { useRef, useState } from "react";
import { formatarData, type Recontagem } from "@/lib/ativo-giro";

/** Quantos pixels de arrasto contam como "dispensei", não "toquei sem querer". */
const LIMIAR_PX = 80;

/**
 * Um pedido de recontagem pendente, na aba Contagem.
 *
 * Dois jeitos de interagir: tocar no botão aceita o pedido (o formulário
 * acima entra em modo recontagem). Arrastar para qualquer lado dispensa
 * -- "não é comigo agora" -- sem afetar o pedido para o resto do time.
 *
 * Ponteiro (não touch/mouse separados) porque cobre celular e desktop com
 * o mesmo código, e é o que permite testar isto num navegador comum.
 */
export function CartaoRecontagem({
  r,
  aoRecontar,
  aoDispensar,
}: {
  r: Recontagem;
  aoRecontar: () => void;
  aoDispensar: () => void;
}) {
  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const inicioX = useRef<number | null>(null);

  function aoPressionar(e: React.PointerEvent) {
    inicioX.current = e.clientX;
    setArrastando(true);
  }

  function aoMover(e: React.PointerEvent) {
    if (inicioX.current === null) return;
    setDeslocamento(e.clientX - inicioX.current);
  }

  function aoSoltar() {
    if (inicioX.current === null) return;
    inicioX.current = null;
    setArrastando(false);

    if (Math.abs(deslocamento) > LIMIAR_PX) {
      setSaindo(true);
      // O cartão termina de deslizar para fora antes de a linha sumir de
      // vez -- sem isto o dispensar corta o gesto no meio, e parece bug.
      setTimeout(aoDispensar, 150);
    } else {
      setDeslocamento(0);
    }
  }

  return (
    <div
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      style={{
        transform: `translateX(${saindo ? (deslocamento >= 0 ? 400 : -400) : deslocamento}px)`,
        opacity: saindo ? 0 : 1 - Math.min(Math.abs(deslocamento) / 300, 0.7),
        transition: arrastando ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
        touchAction: "pan-y",
      }}
      className="flex select-none items-center justify-between gap-3 rounded-xl border border-gold bg-amber-50 p-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-900">🔁 Recontagem pedida</p>
        <p className="text-xs text-amber-700">
          {r.descricao} — {formatarData(r.dia)}, pedido por {r.solicitadoNome}
        </p>
      </div>
      <button
        type="button"
        onClick={aoRecontar}
        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
      >
        Recontar agora
      </button>
    </div>
  );
}
