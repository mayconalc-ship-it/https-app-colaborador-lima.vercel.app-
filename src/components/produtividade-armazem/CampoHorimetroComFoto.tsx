"use client";

import { useState } from "react";
import { avaliarHorimetro, formatarNumeroBr } from "@/lib/empilhadeira-gas";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Foto do horímetro + o campo numérico, juntos. A leitura automática por
 * IA foi removida em 27/08/2026 (pedido do dono): demorava para processar
 * e trazia número errado (sem o ponto decimal ou com dígitos faltando).
 *
 * O que entrou no lugar (28/08/2026) é mais simples e resolve melhor: o
 * campo mostra, ENQUANTO A PESSOA DIGITA, quantas horas aquele número
 * significa desde a última leitura da máquina. "5485,0" digitado como
 * "54850" vira na hora um aviso de 49.365 horas -- impossível de não
 * notar, e o erro é corrigido antes de virar dado.
 *
 * A mesma régua roda no servidor (ver avaliarHorimetro), então a tela
 * nunca promete o que a ação vai recusar.
 */
export function CampoHorimetroComFoto({
  nomeFoto,
  nomeHorimetro,
  idFoto,
  idHorimetro,
  labelFoto,
  labelHorimetro,
  min,
  ultimoHorimetro = null,
}: {
  nomeFoto: string;
  nomeHorimetro: string;
  idFoto: string;
  idHorimetro: string;
  labelFoto: string;
  labelHorimetro: string;
  min?: number;
  /** Última leitura conhecida desta empilhadeira, para comparar. */
  ultimoHorimetro?: number | null;
}) {
  const [valor, setValor] = useState("");

  const numero = Number(valor.replace(",", "."));
  const avaliacao =
    valor.trim() !== "" && Number.isFinite(numero) ? avaliarHorimetro(numero, ultimoHorimetro) : null;

  const cor =
    avaliacao?.nivel === "impossivel"
      ? "border-red-500 ring-2 ring-red-200"
      : avaliacao?.nivel === "atencao"
        ? "border-amber-500 ring-2 ring-amber-200"
        : "";

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
        />
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
          className={`${campo} ${cor}`}
        />

        {ultimoHorimetro !== null && !avaliacao && (
          <p className="mt-1 text-xs text-slate-400">
            Última leitura desta máquina: {formatarNumeroBr(ultimoHorimetro)} h
          </p>
        )}

        {avaliacao?.nivel === "ok" && avaliacao.diferenca > 0 && (
          <p className="mt-1 text-xs font-medium text-green-700">
            ✓ +{formatarNumeroBr(avaliacao.diferenca)} h desde a última leitura
          </p>
        )}

        {avaliacao && avaliacao.nivel !== "ok" && (
          <div
            role="alert"
            className={`mt-2 flex items-start gap-2 rounded-xl border-2 p-3 ${
              avaliacao.nivel === "impossivel"
                ? "border-red-500 bg-red-50"
                : "border-amber-400 bg-amber-50"
            }`}
          >
            <span className="text-lg leading-none">{avaliacao.nivel === "impossivel" ? "🚨" : "⚠️"}</span>
            <p
              className={`text-xs font-medium ${
                avaliacao.nivel === "impossivel" ? "text-red-800" : "text-amber-800"
              }`}
            >
              {avaliacao.mensagem}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
