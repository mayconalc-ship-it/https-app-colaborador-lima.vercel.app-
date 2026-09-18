"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { validarConfigQr } from "@/lib/qr-contingencia";
import { salvarConfigQr } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Um Salvar para a tela toda; trava com a mesma regra do servidor. */
export function FormConfigQr({
  inicial,
}: {
  inicial: { qrUrl: string | null; favorecido: string; cnpj: string; chavePix: string; instrucoes: string };
}) {
  const [previa, setPrevia] = useState<string | null>(inicial.qrUrl);
  const [temArquivoNovo, setTemArquivoNovo] = useState(false);
  const [favorecido, setFavorecido] = useState(inicial.favorecido);
  const [cnpj, setCnpj] = useState(inicial.cnpj);
  const [chavePix, setChavePix] = useState(inicial.chavePix);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);

  const problema = validarConfigQr({
    temQr: temArquivoNovo || Boolean(inicial.qrUrl),
    favorecido: favorecido.trim(),
    cnpj: cnpj.trim(),
    chavePix: chavePix.trim(),
    instrucoes: instrucoes.trim(),
  });

  return (
    <form action={salvarConfigQr} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <span className={rotulo}>Imagem do QR Code</span>
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local ou link assinado
            <img src={previa} alt="QR Code de contingência" className="aspect-square w-full rounded-xl border border-slate-200 object-contain" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
              sem QR
            </div>
          )}
          <input
            type="file"
            name="qr"
            accept="image/*"
            className="mt-2 w-full text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setTemArquivoNovo(Boolean(f));
              if (f) setPrevia(URL.createObjectURL(f));
            }}
          />
          <p className="mt-1 text-[11px] text-slate-400">PNG ou JPG, até 5 MB. Recorte só o QR, sem bordas.</p>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className={rotulo}>Favorecido (nome que aparece no PIX)</span>
            <input name="favorecido" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} maxLength={120} className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>CNPJ</span>
            <input name="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Código PIX copia e cola (opcional)</span>
            <textarea name="chave_pix" value={chavePix} onChange={(e) => setChavePix(e.target.value)} rows={3} maxLength={600} className={campo} />
          </label>
          <label className="block">
            <span className={rotulo}>Instruções para o motorista (opcional)</span>
            <textarea
              name="instrucoes"
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Ex.: confira o nome do favorecido no celular do cliente antes de ele confirmar."
              className={campo}
            />
          </label>
        </div>
      </div>
      {problema && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{problema}</p>}
      <BotaoEnviar
        disabled={Boolean(problema)}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Salvar o QR Code
      </BotaoEnviar>
    </form>
  );
}
