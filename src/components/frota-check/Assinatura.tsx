"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Quadro para assinar com o dedo (ou o mouse). Devolve um PNG em data URL
 * a cada traço; vazio = null. Fundo branco, traço escuro, sem biblioteca.
 */
export function QuadroAssinatura({ aoMudar }: { aoMudar: (png: string | null) => void }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  // ref e não estado: o fim do traço roda no mesmo desenho do começo
  const temTraco = useRef(false);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, r.width, r.height);
      g.lineWidth = 2.4;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "#0f172a";
      temTraco.current = false;
      setVazio(true);
      aoMudar(null);
    };
    ajustar();
    // girar o celular muda a largura: o quadro recomeça limpo. O teclado
    // (digitar o km) muda só a altura da janela e não pode apagar a assinatura.
    let largura = c.getBoundingClientRect().width;
    const aoRedimensionar = () => {
      const nova = c.getBoundingClientRect().width;
      if (Math.abs(nova - largura) < 1) return;
      largura = nova;
      ajustar();
    };
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao montar
  }, []);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    ultimo.current = ponto(e);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || !ultimo.current) return;
    const g = e.currentTarget.getContext("2d");
    if (!g) return;
    const p = ponto(e);
    g.beginPath();
    g.moveTo(ultimo.current.x, ultimo.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    ultimo.current = p;
    temTraco.current = true;
    if (vazio) setVazio(false);
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    ultimo.current = null;
    const c = tela.current;
    if (c && temTraco.current) aoMudar(c.toDataURL("image/png"));
  }

  function limpar() {
    const c = tela.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const r = c.getBoundingClientRect();
    g.fillStyle = "#fff";
    g.fillRect(0, 0, r.width, r.height);
    temTraco.current = false;
    setVazio(true);
    aoMudar(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={tela}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
          className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
          aria-label="Quadro da assinatura"
        />
        {vazio && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Assine aqui com o dedo
          </span>
        )}
        <span className="pointer-events-none absolute bottom-7 left-4 right-4 border-b border-slate-300" />
      </div>
      <button type="button" onClick={limpar} className="mt-1 text-xs font-semibold text-primary">
        Limpar
      </button>
    </div>
  );
}
