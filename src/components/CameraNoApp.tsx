"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Images, RotateCcw, X } from "lucide-react";
import { reduzir } from "@/lib/reduzir-foto";

/** Lado maior da foto tirada aqui: o mesmo do CampoFoto e do servidor. */
const LADO_MAIOR = 1600;
const QUALIDADE = 0.8;

/**
 * A CÂMERA DENTRO DO APP (02/10/2026).
 *
 * Pedido do dono: no celular com pouca memória, o <input capture> abre o
 * aplicativo de câmera do aparelho, o Android fecha o navegador para
 * liberar memória e, na volta, a página recarrega -- a foto (e o que
 * estava sendo preenchido) se perde. Aqui a câmera roda NA PRÓPRIA
 * PÁGINA (getUserMedia): o app nunca sai da tela.
 *
 * A foto já sai reduzida (1600 px, JPEG 80 -- ou o que o campo pedir),
 * direto do vídeo para o canvas, sem passar pela foto de 12 MP da câmera.
 *
 * CONFERIR ANTES DE USAR (05/10/2026, pedido do dono: o botão "para
 * validar e enviar a foto" não se via e parecia não funcionar). O disparo
 * era um aro branco transparente sobre o vídeo, e depois dele a câmera
 * continuava aberta só com um "✓ 1" no canto -- quem tirava a foto não
 * sabia se ela tinha ido. Agora: botão de disparo sólido e com nome, a
 * foto aparece para conferir, e "✓ Usar esta foto" é o botão verde
 * grande. Com espaço para mais fotos, a câmera volta e mostra "Concluir".
 *
 * Se o aparelho não deixar (permissão negada, navegador antigo), cai para
 * a câmera do celular e para a galeria, como antes.
 */
export function CameraNoApp({
  restantes,
  aoTirar,
  aoFechar,
  ladoMaior = LADO_MAIOR,
  qualidade = QUALIDADE,
}: {
  /** Quantas fotos ainda cabem no item. */
  restantes: number;
  aoTirar: (foto: File) => void;
  aoFechar: () => void;
  /** Lado maior da foto, em pixels. */
  ladoMaior?: number;
  /** Qualidade do JPEG, de 0 a 1. */
  qualidade?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<"abrindo" | "pronta" | "sem-camera">("abrindo");
  const [tiradas, setTiradas] = useState(0);
  const [previa, setPrevia] = useState<{ url: string; foto: File } | null>(null);

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

  // A prévia é um link local (blob:): solto quando sai da tela.
  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa.url);
  }, [previa]);

  const falta = restantes - tiradas;

  function tirar() {
    const v = video.current;
    if (!v || !v.videoWidth || falta <= 0) return;
    const escala = Math.min(1, ladoMaior / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const foto = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPrevia({ url: URL.createObjectURL(blob), foto });
      },
      "image/jpeg",
      qualidade,
    );
  }

  function usar() {
    if (!previa) return;
    aoTirar(previa.foto);
    setTiradas((n) => n + 1);
    setPrevia(null);
    if (falta - 1 <= 0) aoFechar();
  }

  async function doAparelho(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.currentTarget.files ?? []).slice(0, Math.max(falta, 0));
    e.currentTarget.value = "";
    for (const a of arquivos) aoTirar(await reduzir(a, `${a.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, ladoMaior, qualidade));
    if (arquivos.length) aoFechar();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">
          {previa
            ? "Ficou boa? Confira antes de usar"
            : falta > 0
              ? `Cabem mais ${falta} foto${falta === 1 ? "" : "s"}`
              : "Limite de fotos do item"}
        </span>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar a câmera"
          className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
        >
          <X size={20} aria-hidden /> Fechar
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* O vídeo continua montado durante a prévia: voltar para tirar
            outra é instantâneo, sem abrir a câmera de novo. */}
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
        {previa && (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
          <img src={previa.url} alt="Foto tirada" className="absolute inset-0 h-full w-full bg-black object-contain" />
        )}
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

      {previa ? (
        <div className="grid grid-cols-2 gap-3 px-4 pb-8 pt-4">
          <button
            type="button"
            onClick={() => setPrevia(null)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-4 text-base font-bold text-white"
          >
            <RotateCcw size={22} aria-hidden /> Tirar outra
          </button>
          <button
            type="button"
            onClick={usar}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-4 text-base font-bold text-white shadow-lg"
          >
            <Check size={24} strokeWidth={3} aria-hidden /> Usar esta foto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 items-center gap-2 px-4 pb-8 pt-4">
          <label className="flex cursor-pointer flex-col items-center gap-1 justify-self-start text-white" title="Escolher da galeria">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Images size={22} aria-hidden />
            </span>
            <span className="text-[11px] font-semibold">Galeria</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={doAparelho} />
          </label>

          {estado === "sem-camera" ? (
            <label className="flex cursor-pointer flex-col items-center gap-1 justify-self-center text-white" title="Câmera do celular">
              <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white text-slate-900 ring-4 ring-white/40">
                <Camera size={32} aria-hidden />
              </span>
              <span className="text-xs font-bold">Abrir a câmera</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={doAparelho} />
            </label>
          ) : (
            <button
              type="button"
              onClick={tirar}
              disabled={estado !== "pronta" || falta <= 0}
              className="flex flex-col items-center gap-1 justify-self-center text-white transition active:scale-90 disabled:opacity-40"
            >
              {/* Sólido e com nome: o aro transparente sumia no vídeo. */}
              <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white ring-4 ring-white/40">
                <Camera size={30} className="text-slate-900" aria-hidden />
              </span>
              <span className="text-xs font-bold">Tirar foto</span>
            </button>
          )}

          {tiradas > 0 ? (
            <button
              type="button"
              onClick={aoFechar}
              className="flex flex-col items-center gap-1 justify-self-end text-white"
              aria-label={`Concluir: ${tiradas} foto${tiradas === 1 ? "" : "s"}`}
            >
              <span className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 font-bold">
                <Check size={20} strokeWidth={3} aria-hidden /> {tiradas}
              </span>
              <span className="text-[11px] font-semibold">Concluir</span>
            </button>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
