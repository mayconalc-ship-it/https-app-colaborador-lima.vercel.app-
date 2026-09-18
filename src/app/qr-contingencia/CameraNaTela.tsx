"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A CÂMERA DENTRO DA TELA (18/09/2026).
 *
 * O primeiro teste do dono no celular deu "não foi possível completar
 * devido a memória insuficiente". É o Android: o `<input capture>` abre o
 * APLICATIVO de câmera, e num aparelho com pouca memória o sistema fecha o
 * navegador em segundo plano -- na volta, a foto se perdeu.
 *
 * Aqui a imagem da câmera roda dentro da própria página (getUserMedia), o
 * navegador nunca sai da tela e não há o que o Android fechar. De quebra,
 * a foto já nasce do tamanho certo (1600 px), sem ter de carregar os 12
 * megapixels da câmera na memória para reduzir depois.
 *
 * Sem permissão ou sem suporte, `aoFalhar` devolve o controle para quem
 * chamou, que cai no jeito antigo.
 */
export function CameraNaTela({
  restantes,
  aoCapturar,
  aoFechar,
  aoFalhar,
}: {
  restantes: number;
  aoCapturar: (foto: File) => void;
  aoFechar: () => void;
  aoFalhar: (motivo: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const [pronta, setPronta] = useState(false);
  const [tiradas, setTiradas] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("sem suporte");
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxo.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setPronta(true);
      } catch (e) {
        const negado = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        aoFalhar(
          negado
            ? "A câmera não foi liberada para o app. Vou abrir a câmera do celular — ou libere a câmera nas permissões do navegador."
            : "Não deu para abrir a câmera aqui. Vou abrir a câmera do celular.",
        );
      }
    })();
    return () => {
      cancelado = true;
      fluxo.current?.getTracks().forEach((t) => t.stop());
    };
  }, [aoFalhar]);

  function capturar() {
    const v = video.current;
    if (!v || !v.videoWidth || restantes - tiradas <= 0) return;
    const escala = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        aoCapturar(new File([blob], `comprovante-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setTiradas((n) => n + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
      },
      "image/jpeg",
      0.8,
    );
  }

  const acabou = restantes - tiradas <= 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Câmera">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
        {!pronta && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Abrindo a câmera...</p>
        )}
        <p className="absolute left-0 right-0 top-3 text-center text-xs font-semibold text-white drop-shadow">
          Enquadre o comprovante inteiro, com o valor e o código legíveis
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 bg-black px-5 pb-8 pt-4">
        <span className="w-20 text-sm text-white">
          {tiradas} foto{tiradas === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={capturar}
          disabled={!pronta || acabou}
          aria-label="Tirar foto"
          className="h-18 w-18 rounded-full border-4 border-white bg-white/90 disabled:opacity-40"
          style={{ height: 72, width: 72 }}
        />
        <button
          type="button"
          onClick={aoFechar}
          className="w-20 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-white"
        >
          Pronto
        </button>
      </div>
    </div>
  );
}
