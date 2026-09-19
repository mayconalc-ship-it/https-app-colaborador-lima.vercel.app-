"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  LIMITES_QR,
  digitosDoValor,
  lerValor,
  mostrarDigitosEmReais,
  validarComprovante,
  valorDosDigitos,
} from "@/lib/qr-contingencia";
import { editarComprovante } from "./actions";
import { cursorNoFim, reduzir } from "./ajudantes";
import { CameraNaTela } from "./CameraNaTela";
import type { ComprovanteDaTela } from "./TelaContingencia";

type FotoNova = { id: string; arquivo: File; previa: string };

/**
 * EDITAR VALOR E FOTOS de um comprovante de hoje (pedido do dono,
 * 19/09/2026 -- no lugar do "Apagar"). Tira foto errada, acrescenta a que
 * faltou, corrige o valor. As mesmas travas do registro, aqui e no
 * servidor: valor obrigatório e pelo menos uma foto no fim.
 */
export function EditarComprovante({
  comprovante,
  online,
  aoFechar,
  aoSalvar,
}: {
  comprovante: ComprovanteDaTela;
  online: boolean;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const valorInicial = comprovante.valor != null ? String(Math.round(comprovante.valor * 100)) : "";
  const [valor, setValor] = useState(valorInicial);
  const [removidas, setRemovidas] = useState<Set<string>>(new Set());
  const [novas, setNovas] = useState<FotoNova[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [reduzindo, setReduzindo] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [salvando, iniciar] = useTransition();
  const inputGaleria = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);

  // Prévias são URLs do navegador: soltam a memória ao fechar.
  const novasAtuais = useRef<FotoNova[]>([]);
  useEffect(() => {
    novasAtuais.current = novas;
  }, [novas]);
  useEffect(() => () => novasAtuais.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  const ficam = comprovante.fotos.filter((f) => !removidas.has(f.id)).length;
  const total = ficam + novas.length;
  const cheio = total >= LIMITES_QR.fotosMax;

  // A MESMA regra do servidor (editarComprovante).
  const problema = validarComprovante({
    codPdv: comprovante.codPdv,
    valor: lerValor(valorDosDigitos(valor)),
    observacao: "",
    fotos: [
      ...Array.from({ length: ficam }, () => ({ tamanho: 1, tipo: "" })),
      ...novas.map((f) => ({ tamanho: f.arquivo.size, tipo: f.arquivo.type })),
    ],
  });
  const mudou = valor !== valorInicial || removidas.size > 0 || novas.length > 0;

  function alternar(id: string) {
    setRemovidas((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function adicionar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setReduzindo(true);
    const vindo: FotoNova[] = [];
    for (const arquivo of Array.from(lista)) {
      if (total + vindo.length >= LIMITES_QR.fotosMax) break;
      const r = await reduzir(arquivo);
      vindo.push({ id: `${Date.now()}-${Math.random()}`, arquivo: r, previa: URL.createObjectURL(r) });
    }
    setNovas((atual) => [...atual, ...vindo]);
    setReduzindo(false);
  }

  const capturada = useCallback((arquivo: File) => {
    setNovas((atual) => [...atual, { id: `${Date.now()}-${Math.random()}`, arquivo, previa: URL.createObjectURL(arquivo) }]);
  }, []);
  const cameraFalhou = useCallback((motivo: string) => {
    setCameraAberta(false);
    setErro(motivo);
  }, []);

  function tirarNova(id: string) {
    setNovas((atual) => {
      const saindo = atual.find((f) => f.id === id);
      if (saindo) URL.revokeObjectURL(saindo.previa);
      return atual.filter((f) => f.id !== id);
    });
  }

  function salvar() {
    if (problema || !mudou) return;
    setErro(null);
    const fd = new FormData();
    fd.set("id", comprovante.id);
    fd.set("valor", valorDosDigitos(valor));
    removidas.forEach((id) => fd.append("remover", id));
    novas.forEach((f) => fd.append("fotos", f.arquivo));
    iniciar(async () => {
      try {
        const r = await editarComprovante(fd);
        if (r.ok) aoSalvar(r.mensagem);
        else setErro(r.erro);
      } catch {
        setErro("O sinal caiu. Tente salvar de novo quando tiver internet.");
      }
    });
  }

  const miniatura = "aspect-[3/4] w-full rounded-lg border border-slate-200 object-cover";

  return (
    <div className="space-y-3 border-t border-primary/20 bg-primary-soft/40 px-3 py-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Fotos ({total}/{LIMITES_QR.fotosMax}) — toque no ✕ para tirar
        </p>
        <ul className="grid grid-cols-4 gap-2">
          {comprovante.fotos.map((f, i) => {
            const saindo = removidas.has(f.id);
            return (
              <li key={f.id} className="relative">
                {f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário
                  <img src={f.url} alt={`Foto ${i + 1}`} className={`${miniatura} ${saindo ? "opacity-30" : ""}`} />
                ) : (
                  <div className={`${miniatura} bg-slate-100`} />
                )}
                <button
                  type="button"
                  onClick={() => alternar(f.id)}
                  aria-label={saindo ? `Manter foto ${i + 1}` : `Tirar foto ${i + 1}`}
                  className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${
                    saindo ? "bg-emerald-600" : "bg-black/60"
                  }`}
                >
                  {saindo ? "↺" : "✕"}
                </button>
              </li>
            );
          })}
          {novas.map((f, i) => (
            <li key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local do aparelho */}
              <img src={f.previa} alt={`Foto nova ${i + 1}`} className={`${miniatura} ring-2 ring-primary`} />
              <button
                type="button"
                onClick={() => tirarNova(f.id)}
                aria-label={`Tirar foto nova ${i + 1}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setErro(null);
              if (typeof navigator.mediaDevices?.getUserMedia === "function") setCameraAberta(true);
              else inputCamera.current?.click();
            }}
            disabled={reduzindo || cheio}
            className="rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            📷 Tirar foto
          </button>
          <button
            type="button"
            onClick={() => inputGaleria.current?.click()}
            disabled={reduzindo || cheio}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            🖼️ Da galeria
          </button>
        </div>
        {reduzindo && <p className="mt-2 text-xs text-slate-500">Preparando a foto...</p>}
        {cameraAberta && (
          <CameraNaTela
            restantes={LIMITES_QR.fotosMax - total}
            aoCapturar={capturada}
            aoFechar={() => setCameraAberta(false)}
            aoFalhar={cameraFalhou}
          />
        )}
        <input
          ref={inputCamera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            adicionar(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={inputGaleria}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            adicionar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Valor pago <span className="text-red-600">*</span>
        </span>
        <input
          value={mostrarDigitosEmReais(valor)}
          onFocus={cursorNoFim}
          onClick={cursorNoFim}
          onSelect={cursorNoFim}
          onChange={(e) => setValor(digitosDoValor(e.target.value))}
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Valor pago em reais"
          className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-lg font-semibold tabular-nums focus:border-primary focus:outline-none ${
            valor ? "text-slate-900" : "text-slate-400"
          }`}
        />
      </label>

      {(erro || (mudou && problema)) && <p className="text-sm text-red-600">{erro ?? problema}</p>}
      {!online && <p className="text-xs text-amber-800">Sem internet: a edição só salva com sinal.</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={!mudou || Boolean(problema) || salvando || reduzindo || !online}
          className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
        <button
          type="button"
          onClick={aoFechar}
          disabled={salvando}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
