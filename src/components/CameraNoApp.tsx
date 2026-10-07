"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Images, RefreshCcw, RotateCcw, X } from "lucide-react";
import { reduzir } from "@/lib/reduzir-foto";

/** Lado maior da foto tirada aqui: o mesmo do CampoFoto e do servidor. */
const LADO_MAIOR = 1600;
const QUALIDADE = 0.8;

/** Os degraus de zoom, como no aplicativo de câmera do celular. */
const ZOOMS = [1, 1.5, 2] as const;

/** A lente escolhida fica lembrada no aparelho (o id é por site e estável). */
const CHAVE_LENTE = "camera-no-app:lente:v1";

const VIDEO_IDEAL = { width: { ideal: 1920 }, height: { ideal: 1440 } };

/** Lente traseira que NÃO é a principal: ultra-angular, tele, macro... */
const LENTE_SECUNDARIA = /ultra|wide|grande.?angular|tele|macro|depth|profund|dual|dupla|triple|tripla/i;
const TRASEIRA = /back|rear|traseir|environment|facing back/i;

function lerLente() {
  try {
    return localStorage.getItem(CHAVE_LENTE);
  } catch {
    return null;
  }
}
function gravarLente(id: string) {
  try {
    localStorage.setItem(CHAVE_LENTE, id);
  } catch {
    // Sem guardar: na próxima vez escolhe de novo pelo nome da lente.
  }
}

/**
 * A lente principal entre as traseiras. No Android o nome é
 * "camera2 N, facing back" e a principal é a de menor N; a ultra-angular
 * costuma vir depois -- e é ela que o Chrome entrega em alguns aparelhos
 * quando se pede só "a câmera de trás". No iPhone os nomes dizem o tipo.
 */
function lentePrincipal(traseiras: MediaDeviceInfo[]) {
  const candidatas = traseiras.filter((d) => !LENTE_SECUNDARIA.test(d.label));
  const lista = candidatas.length ? candidatas : traseiras;
  const numero = (d: MediaDeviceInfo) => Number(/camera2?\s*(\d+)/i.exec(d.label)?.[1] ?? Number.POSITIVE_INFINITY);
  return [...lista].sort((a, b) => numero(a) - numero(b))[0] ?? null;
}

type ZoomNativo = { min: number; max: number };

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
 * PRIMEIRA RONDA DO CHECK DE MANUTENÇÃO (07/10/2026), duas queixas:
 *  - "A câmera parece afastada." Duas causas: em alguns Android o Chrome
 *    entrega a lente ULTRA-ANGULAR quando se pede a câmera de trás; e o
 *    vídeo era mostrado recortado para encher a tela, então a foto saía
 *    com mais coisa do que se via. Agora: escolhe a lente principal (e há
 *    o botão de trocar, que fica lembrado), tem zoom 1x/1,5x/2x, e o
 *    vídeo aparece inteiro -- o que se vê é o que sai na foto.
 *  - "Tirei a foto e ao sair da câmera ela sumiu." Fechar (ou o "voltar"
 *    do Android) com a foto na conferência a descartava sem aviso, e o
 *    "voltar" ainda saía da página. Agora a foto na conferência é USADA
 *    ao fechar, o "voltar" só fecha a câmera, e se o celular tirar o app
 *    da tela no meio da conferência a foto também é usada (e guardada).
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
  const [lentes, setLentes] = useState<MediaDeviceInfo[]>([]);
  const [lenteAtual, setLenteAtual] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [zoomNativo, setZoomNativo] = useState<ZoomNativo | null>(null);

  // Os valores de agora para quem roda fora do desenho (voltar do
  // Android, app saindo da tela).
  const previaAgora = useRef(previa);
  const fechou = useRef(false);
  // Quem monta a câmera passa funções novas a cada desenho; guardadas
  // aqui, o "voltar" fica registrado uma vez só (senão cada desenho
  // empilharia uma entrada nova na história).
  const avisos = useRef({ aoTirar, aoFechar });
  useEffect(() => {
    previaAgora.current = previa;
  }, [previa]);
  useEffect(() => {
    avisos.current = { aoTirar, aoFechar };
  });

  /** Liga o vídeo numa lente; sem `deviceId`, deixa o navegador escolher a de trás. */
  const ligar = useCallback(async (deviceId: string | null) => {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    const s = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, ...VIDEO_IDEAL } : { facingMode: { ideal: "environment" }, ...VIDEO_IDEAL },
      audio: false,
    });
    fluxo.current = s;
    const trilha = s.getVideoTracks()[0];
    // Zoom de verdade (da lente) quando o aparelho oferece; senão, recorte.
    const cap = (trilha?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
    setZoomNativo(cap.zoom && cap.zoom.max > cap.zoom.min ? { min: cap.zoom.min, max: cap.zoom.max } : null);
    setZoom(1);
    setLenteAtual(trilha?.getSettings?.().deviceId ?? deviceId);
    if (video.current) {
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
    }
    return s;
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function abrir() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("sem-camera");
        return;
      }
      try {
        let guardada = lerLente();
        let s: MediaStream;
        try {
          s = await ligar(guardada);
        } catch {
          guardada = null; // a lente guardada sumiu (outro aparelho, permissão nova)
          s = await ligar(null);
        }
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        // Os nomes das lentes só aparecem depois da permissão.
        const todas = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        const traseiras = todas.filter((d) => TRASEIRA.test(d.label));
        if (cancelado) return;
        setLentes(traseiras.length ? traseiras : todas);
        if (!guardada) {
          const principal = lentePrincipal(traseiras);
          const atual = s.getVideoTracks()[0]?.getSettings?.().deviceId;
          if (principal && principal.deviceId && principal.deviceId !== atual) {
            await ligar(principal.deviceId).catch(() => ligar(null));
          }
        }
        if (!cancelado) setEstado("pronta");
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
  }, [ligar]);

  // A prévia é um link local (blob:): solto quando sai da tela.
  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa.url);
  }, [previa]);

  const falta = restantes - tiradas;

  /** Fecha a câmera. A foto que estava na conferência é USADA, nunca perdida. */
  const fechar = useCallback(() => {
    if (fechou.current) return;
    fechou.current = true;
    const p = previaAgora.current;
    previaAgora.current = null;
    if (p) avisos.current.aoTirar(p.foto);
    avisos.current.aoFechar();
  }, []);

  // O "voltar" do Android fecha a câmera em vez de sair do checklist.
  useEffect(() => {
    // Uma entrada só, mesmo se o efeito rodar duas vezes.
    if (!window.history.state?.cameraNoApp) window.history.pushState({ ...window.history.state, cameraNoApp: true }, "");
    const aoVoltar = () => fechar();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [fechar]);

  /** Fechou pelos botões: tira da história a entrada que a câmera pôs. */
  function fecharPeloBotao() {
    fechar();
    if (window.history.state?.cameraNoApp) window.history.back();
  }

  // O celular tirou o app da tela (ligação, outro app) no meio da
  // conferência: a foto vai para o item agora, antes de o Android poder
  // matar a página.
  useEffect(() => {
    const aoSumir = () => {
      if (document.visibilityState !== "hidden" || !previaAgora.current) return;
      usar();
    };
    document.addEventListener("visibilitychange", aoSumir);
    return () => document.removeEventListener("visibilitychange", aoSumir);
  });

  async function escolherZoom(z: number) {
    setZoom(z);
    if (!zoomNativo) return;
    const trilha = fluxo.current?.getVideoTracks()[0];
    // Na escala do navegador, 1 é a lente principal sem zoom.
    const alvo = Math.min(zoomNativo.max, Math.max(zoomNativo.min, z));
    // `zoom` ainda não está nos tipos do TypeScript.
    await trilha?.applyConstraints({ advanced: [{ zoom: alvo } as MediaTrackConstraintSet] }).catch(() => setZoomNativo(null));
  }

  async function trocarLente() {
    if (lentes.length < 2) return;
    const i = lentes.findIndex((l) => l.deviceId === lenteAtual);
    const proxima = lentes[(i + 1) % lentes.length];
    try {
      await ligar(proxima.deviceId);
      gravarLente(proxima.deviceId);
    } catch {
      await ligar(lenteAtual).catch(() => setEstado("sem-camera"));
    }
  }

  // Zoom por recorte (aparelho sem zoom de lente): o centro do quadro.
  const recorte = zoomNativo ? 1 : zoom;

  function tirar() {
    const v = video.current;
    if (!v || !v.videoWidth || falta <= 0) return;
    // Exatamente o pedaço do quadro que está aparecendo: o vídeo cabe
    // inteiro na tela (contain) e o zoom por recorte o amplia pelo centro.
    const ajuste = Math.min(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight) || 1;
    const fx = Math.min(1, v.clientWidth / (v.videoWidth * ajuste * recorte));
    const fy = Math.min(1, v.clientHeight / (v.videoHeight * ajuste * recorte));
    const sw = v.videoWidth * fx;
    const sh = v.videoHeight * fy;
    const escala = Math.min(1, ladoMaior / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * escala);
    canvas.height = Math.round(sh * escala);
    canvas.getContext("2d")?.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
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
    const p = previaAgora.current;
    if (!p) return;
    previaAgora.current = null;
    aoTirar(p.foto);
    setTiradas((n) => n + 1);
    setPrevia(null);
    if (falta - 1 <= 0) fecharPeloBotao();
  }

  async function doAparelho(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.currentTarget.files ?? []).slice(0, Math.max(falta, 0));
    e.currentTarget.value = "";
    for (const a of arquivos) aoTirar(await reduzir(a, `${a.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, ladoMaior, qualidade));
    if (arquivos.length) fecharPeloBotao();
  }

  const rotuloZoom = (z: number) => `${String(z).replace(".", ",")}x`;

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
          onClick={fecharPeloBotao}
          aria-label={previa ? "Usar esta foto e fechar a câmera" : "Fechar a câmera"}
          className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
        >
          <X size={20} aria-hidden /> Fechar
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* O vídeo continua montado durante a prévia: voltar para tirar
            outra é instantâneo, sem abrir a câmera de novo. Inteiro na
            tela (contain): o que se vê é exatamente o que sai na foto. */}
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain transition-transform"
          style={recorte > 1 ? { transform: `scale(${recorte})` } : undefined}
        />
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
        {estado === "pronta" && !previa && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            <div className="flex gap-1 rounded-full bg-black/55 p-1" role="group" aria-label="Zoom">
              {ZOOMS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => escolherZoom(z)}
                  aria-pressed={zoom === z}
                  className={`h-10 min-w-10 rounded-full px-2 text-sm font-bold ${
                    zoom === z ? "bg-white text-slate-900" : "text-white"
                  }`}
                >
                  {rotuloZoom(z)}
                </button>
              ))}
            </div>
            {lentes.length > 1 && (
              <button
                type="button"
                onClick={trocarLente}
                className="flex h-12 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white"
                title="Trocar a lente da câmera de trás (fica lembrado neste celular)"
              >
                <RefreshCcw size={16} aria-hidden /> Lente {Math.max(1, lentes.findIndex((l) => l.deviceId === lenteAtual) + 1)}/
                {lentes.length}
              </button>
            )}
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
              onClick={fecharPeloBotao}
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
