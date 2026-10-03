"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { reduzir } from "@/lib/reduzir-foto";

/** Lado maior da foto tirada aqui: o mesmo do CampoFoto e do servidor. */
const LADO_MAIOR = 1600;

/**
 * A CÂMERA DENTRO DO APP (02/10/2026).
 *
 * Pedido do dono: no celular com pouca memória, o <input capture> abre o
 * aplicativo de câmera do aparelho, o Android fecha o navegador para
 * liberar memória e, na volta, a página recarrega -- a foto (e o que
 * estava sendo preenchido) se perde. Aqui a câmera roda NA PRÓPRIA
 * PÁGINA (getUserMedia): o app nunca sai da tela.
 *
 * A foto já sai reduzida (1600 px, JPEG 80), direto do vídeo para o
 * canvas, sem passar pela foto de 12 MP da câmera.
 *
 * Se o aparelho não deixar (permissão negada, navegador antigo), cai para
 * a câmera do celular e para a galeria, como antes.
 */
export function CameraNoApp({
  restantes,
  aoTirar,
  aoFechar,
}: {
  /** Quantas fotos ainda cabem no item. */
  restantes: number;
  aoTirar: (foto: File) => void;
  aoFechar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<"abrindo" | "pronta" | "sem-camera">("abrindo");
  const [tiradas, setTiradas] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function abrir() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("sem-camera");
        return;
      }
      try {
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
          await video.current.play().catch(() => {});
        }
        setEstado("pronta");
      } catch {
        if (!cancelado) setEstado("sem-camera");
      }
    }
    abrir();
    return () => {
      cancelado = true;
      // Desliga a câmera ao fechar: a luz verde apaga e a memória volta.
      fluxo.current?.getTracks().forEach((t) => t.stop());
      fluxo.current = null;
    };
  }, []);

  const falta = restantes - tiradas;

  function tirar() {
    const v = video.current;
    if (!v || !v.videoWidth || falta <= 0) return;
    const escala = Math.min(1, LADO_MAIOR / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        aoTirar(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setTiradas((n) => n + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
        if (falta - 1 <= 0) aoFechar();
      },
      "image/jpeg",
      0.8,
    );
  }

  async function doAparelho(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.currentTarget.files ?? []).slice(0, Math.max(falta, 0));
    e.currentTarget.value = "";
    for (const a of arquivos) aoTirar(await reduzir(a, `${a.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`));
    if (arquivos.length) aoFechar();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">
          {falta > 0 ? `Cabem mais ${falta} foto${falta === 1 ? "" : "s"}` : "Limite de fotos do item"}
        </span>
        <button type="button" onClick={aoFechar} aria-label="Fechar a câmera" className="rounded-full bg-white/15 p-2">
          <X size={22} aria-hidden />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {estado === "abrindo" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Abrindo a câmera...</p>
        )}
        {estado === "sem-camera" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
            <Camera size={40} aria-hidden className="opacity-60" />
            <p className="font-semibold">Não deu para abrir a câmera aqui</p>
            <p className="text-sm text-white/70">
              Libere a câmera para o app nas permissões do navegador, ou use os botões abaixo.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-around gap-4 px-6 pb-8 pt-4">
        <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-white/15 text-white" title="Escolher da galeria">
          <Images size={22} aria-hidden />
          <span className="sr-only">Escolher da galeria</span>
          <input type="file" accept="image/*" multiple className="sr-only" onChange={doAparelho} />
        </label>

        {estado === "sem-camera" ? (
          <label className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-2xl bg-white text-slate-900" title="Câmera do celular">
            <Camera size={30} aria-hidden />
            <span className="sr-only">Usar a câmera do celular</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={doAparelho} />
          </label>
        ) : (
          <button
            type="button"
            onClick={tirar}
            disabled={estado !== "pronta" || falta <= 0}
            aria-label="Tirar a foto"
            className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/30 transition active:scale-90 disabled:opacity-40"
          />
        )}

        <span className="flex h-12 w-12 items-center justify-center text-sm font-bold text-white" aria-live="polite">
          {tiradas > 0 ? `✓ ${tiradas}` : ""}
        </span>
      </div>
    </div>
  );
}
