"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Passos do zoom. O toque alterna entre o primeiro e o segundo. */
const ESCALAS = [1, 2, 3];

/** Movimento em pixels abaixo do qual o gesto conta como toque, não arrasto. */
const TOLERANCIA_TOQUE = 8;

/**
 * Foto da notícia que abre em tela cheia ao ser tocada.
 *
 * Na lista o app precisa recortar a imagem para o layout não quebrar, e nas
 * fotos do jornal costuma ter informação importante justamente nas bordas.
 * Aqui a foto aparece inteira, e dá para ampliar: o app trava o zoom de
 * pinça do celular (senão a tela ficava presa depois do zoom), então a
 * ampliação tem que vir por botão.
 *
 * O arrasto é feito na mão, com eventos de ponteiro, e não com a rolagem
 * do navegador. No Android a rolagem nativa terminava disparando um clique
 * na imagem ao soltar o dedo, o que desfazia o zoom no meio do movimento --
 * dava a impressão de que a foto não percorria.
 *
 * A CAIXA DA FOTO TEM TAMANHO ANTES DA FOTO CHEGAR. Isto não é detalhe de
 * estilo: sem altura reservada, a matéria abria só com o texto e a imagem
 * caía em cima depois, empurrando tudo para baixo enquanto o colaborador já
 * estava lendo. Por isso `classeCaixa` (que carrega a altura) fica no
 * contêiner e a imagem entra com `fill` -- ela ocupa um espaço que já
 * existia, em vez de criar espaço ao carregar.
 */
export function FotoAmpliavel({
  src,
  titulo,
  classeCaixa,
  ajuste = "cover",
  prioridade = false,
  sizes = "100vw",
}: {
  src: string;
  titulo: string;
  /** Dimensões da caixa que segura o lugar da foto: `h-40 w-full`, etc. */
  classeCaixa: string;
  /** `contain` mostra o cartaz inteiro; `cover` recorta para preencher. */
  ajuste?: "cover" | "contain";
  /**
   * Foto que já nasce visível na tela (a de capa). Sai do carregamento
   * preguiçoso e entra na fila de prioridade do navegador -- é o que faz a
   * capa aparecer junto com o texto, e não depois dele.
   */
  prioridade?: boolean;
  /** Largura que a foto ocupa, para o Next servir o arquivo do tamanho certo. */
  sizes?: string;
}) {
  const [carregada, setCarregada] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const botaoFechar = useRef<HTMLButtonElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLImageElement>(null);

  // Guardados em ref porque mudam a cada movimento do dedo: usar estado
  // aqui redesenharia a tela dezenas de vezes por segundo.
  const arrasto = useRef({ ativo: false, x: 0, y: 0, andou: 0 });

  useEffect(() => {
    if (!aberta) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }

    // Sem isso a página de trás rola junto com a foto ampliada.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);
    botaoFechar.current?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  function fechar() {
    setAberta(false);
    setEscala(1);
    setPos({ x: 0, y: 0 });
  }

  /** Impede que a foto seja arrastada para fora da tela. */
  function limitar(x: number, y: number, escalaAtual: number) {
    const caixa = palco.current?.getBoundingClientRect();
    const img = foto.current;
    if (!caixa || !img) return { x, y };

    const limiteX = Math.max(0, (img.offsetWidth * escalaAtual - caixa.width) / 2);
    const limiteY = Math.max(
      0,
      (img.offsetHeight * escalaAtual - caixa.height) / 2,
    );

    return {
      x: Math.min(limiteX, Math.max(-limiteX, x)),
      y: Math.min(limiteY, Math.max(-limiteY, y)),
    };
  }

  function mudarEscala(nova: number) {
    const alvo = Math.min(ESCALAS[ESCALAS.length - 1], Math.max(1, nova));
    setEscala(alvo);
    // Ao voltar para o tamanho normal a foto volta ao centro.
    setPos(alvo === 1 ? { x: 0, y: 0 } : (p) => limitar(p.x, p.y, alvo));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Ver a foto da notícia "${titulo}" em tela cheia`}
        className={`group relative block cursor-zoom-in overflow-hidden ${classeCaixa}`}
      >
        {/* O cinza pulsando é o que o colaborador vê no lugar da foto
            enquanto ela vem. Some no `onLoad`; se a foto falhar, fica um
            retângulo cinza parado -- melhor do que a página dar um pulo. */}
        {!carregada && (
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-slate-200"
          />
        )}
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          priority={prioridade}
          onLoad={() => setCarregada(true)}
          className={`${ajuste === "contain" ? "object-contain" : "object-cover"} transition-opacity duration-300 ${
            carregada ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* A lupa avisa que a foto abre — sem ela ninguém descobre o toque. */}
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs leading-none text-white"
        >
          🔍
        </span>
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto da notícia ${titulo}`}
          className="fixed inset-0 z-50 bg-black/90"
        >
          <div
            ref={palco}
            className="absolute inset-0 flex items-center justify-center overflow-hidden p-3"
            // "none" entrega os gestos para o nosso código. Sem isso o
            // Android tenta rolar a página e briga com o arrasto.
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              arrasto.current = {
                ativo: true,
                x: e.clientX - pos.x,
                y: e.clientY - pos.y,
                andou: 0,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!arrasto.current.ativo) return;

              const x = e.clientX - arrasto.current.x;
              const y = e.clientY - arrasto.current.y;
              arrasto.current.andou = Math.max(
                arrasto.current.andou,
                Math.abs(x - pos.x) + Math.abs(y - pos.y),
              );

              if (escala > 1) setPos(limitar(x, y, escala));
            }}
            onPointerUp={(e) => {
              const { andou } = arrasto.current;
              arrasto.current.ativo = false;

              // Arrastou: já movemos a foto, não é para interpretar como toque.
              if (andou > TOLERANCIA_TOQUE) return;

              const naFoto = foto.current?.contains(e.target as Node);
              if (naFoto) mudarEscala(escala > 1 ? 1 : 2);
              else fechar();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={foto}
              src={src}
              alt={`Foto da notícia ${titulo}`}
              draggable={false}
              className={`max-h-full max-w-full select-none object-contain ${
                escala > 1 ? "cursor-grab" : "cursor-zoom-in"
              }`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
                transition: arrasto.current.ativo ? "none" : "transform 150ms",
              }}
            />
          </div>

          {/* Botões de zoom: no celular o app trava a pinça, então sem eles
              não haveria como ampliar de verdade. */}
          <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => mudarEscala(escala - 1)}
              disabled={escala <= 1}
              aria-label="Diminuir"
              className="h-10 w-10 rounded-full text-xl font-bold text-slate-700 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums text-slate-600">
              {escala}×
            </span>
            <button
              type="button"
              onClick={() => mudarEscala(escala + 1)}
              disabled={escala >= ESCALAS[ESCALAS.length - 1]}
              aria-label="Aumentar"
              className="h-10 w-10 rounded-full text-xl font-bold text-slate-700 disabled:opacity-30"
            >
              +
            </button>
          </div>

          <button
            type="button"
            ref={botaoFechar}
            onClick={fechar}
            className="absolute right-3 top-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-lg hover:bg-slate-100"
          >
            ✕ Fechar
          </button>

          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/70">
            {escala > 1
              ? "Arraste para percorrer a foto"
              : "Toque na foto ou use + para ampliar"}
          </p>
        </div>
      )}
    </>
  );
}
