"use client";

import { useState } from "react";
import { lerHorimetroDaFoto } from "@/app/produtividade-armazem/empilhadeira/actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Foto do horímetro + o campo numérico, juntos -- pedido do dono
 * (27/08/2026): ao escolher a foto, o app já tenta ler o número sozinho
 * (IA, ver lib/empilhadeira-ocr.ts) e pré-preenche o campo. O operador só
 * confere e pode corrigir antes de enviar -- o valor NUNCA é travado, é
 * sempre um `<input>` normal editável, com ou sem leitura automática.
 *
 * A foto vem primeiro na tela de propósito: só faz sentido "conferir o
 * número lido" depois de a leitura já ter acontecido.
 */
export function CampoHorimetroComFoto({
  nomeFoto,
  nomeHorimetro,
  idFoto,
  idHorimetro,
  labelFoto,
  labelHorimetro,
  min,
}: {
  nomeFoto: string;
  nomeHorimetro: string;
  idFoto: string;
  idHorimetro: string;
  labelFoto: string;
  labelHorimetro: string;
  min?: number;
}) {
  const [valor, setValor] = useState("");
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function aoEscolherFoto(arquivo: File | undefined) {
    setAviso(null);
    if (!arquivo) return;

    setLendo(true);
    try {
      const fd = new FormData();
      fd.set("foto", arquivo);
      const leitura = await lerHorimetroDaFoto(fd);
      if (leitura.legivel && leitura.valor !== null) {
        setValor(String(leitura.valor));
        setAviso("🔎 Lido automaticamente da foto — confira antes de continuar.");
      } else {
        setAviso("Não consegui ler o horímetro nesta foto. Digite o valor manualmente.");
      }
    } catch {
      setAviso("Não consegui ler o horímetro nesta foto. Digite o valor manualmente.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <>
      <div>
        <label className={rotulo} htmlFor={idFoto}>
          {labelFoto}
        </label>
        <input
          id={idFoto}
          name={nomeFoto}
          type="file"
          accept="image/*"
          capture="environment"
          required
          className={campo}
          onChange={(e) => void aoEscolherFoto(e.target.files?.[0])}
        />
        {lendo && <p className="mt-1 text-xs text-primary">🔎 Lendo o horímetro na foto...</p>}
        {!lendo && aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
      </div>

      <div>
        <label className={rotulo} htmlFor={idHorimetro}>
          {labelHorimetro}
        </label>
        <input
          id={idHorimetro}
          name={nomeHorimetro}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={min}
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={campo}
        />
      </div>
    </>
  );
}
