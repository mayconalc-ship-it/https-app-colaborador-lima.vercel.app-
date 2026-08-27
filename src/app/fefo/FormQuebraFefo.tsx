"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import {
  DEPOSITOS_FEFO,
  RUAS_FEFO,
  TIPOS_QUEBRA_FEFO,
  TIPO_QUEBRA_FEFO,
  rotuloValidade,
  type TipoQuebraFefo,
} from "@/lib/fefo";
import { buscarProdutosFefo, registrarQuebraFefo } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export function FormQuebraFefo({ clusters, tipos }: { clusters: string[]; tipos: string[] }) {
  const [tipo, setTipo] = useState<TipoQuebraFefo>("data_maior_liberada");
  const [validade, setValidade] = useState("");
  const [menorValidade, setMenorValidade] = useState("");

  // O padrão manda segregar abaixo de 45 dias -- o aviso sai da data, sem
  // ninguém precisar julgar a criticidade na hora.
  const prazo = validade ? rotuloValidade(validade) : null;
  const datasInvertidas = Boolean(validade && menorValidade && menorValidade > validade);

  return (
    <form action={registrarQuebraFefo} className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <span className={rotulo}>O que você encontrou?</span>
          <div className="space-y-2">
            {TIPOS_QUEBRA_FEFO.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${
                  t === tipo ? "border-primary bg-primary-soft" : "border-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={t}
                  checked={t === tipo}
                  onChange={() => setTipo(t)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">
                    {TIPO_QUEBRA_FEFO[t].emoji} {TIPO_QUEBRA_FEFO[t].rotulo}
                  </span>
                  <span className="block text-xs text-slate-500">{TIPO_QUEBRA_FEFO[t].ajuda}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📦</span>
          Produto
        </div>
        <ComboboxProdutoReepack
          clusters={clusters}
          tipos={tipos}
          buscarProdutos={buscarProdutosFefo}
          cookiePath="/fefo"
        />
        <div>
          <label className={rotulo} htmlFor="quantidade">Quantidade encontrada</label>
          <input
            id="quantidade"
            name="quantidade"
            type="number"
            inputMode="numeric"
            min={1}
            required
            className={campo}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📅</span>
          Validades
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="validade">Validade do palete encontrado</label>
            <input
              id="validade"
              name="validade"
              type="date"
              required
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className={campo}
            />
            {prazo && (
              <p className={`mt-1 text-xs ${prazo.critico ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                {prazo.critico ? "⚠️ " : ""}
                {prazo.texto}
                {prazo.critico && " — abaixo dos 45 dias do padrão"}
              </p>
            )}
          </div>
          <div>
            <label className={rotulo} htmlFor="menor_validade">Menor validade no estoque</label>
            <input
              id="menor_validade"
              name="menor_validade"
              type="date"
              required
              value={menorValidade}
              onChange={(e) => setMenorValidade(e.target.value)}
              className={campo}
            />
            {datasInvertidas && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                A menor validade não pode ser maior que a do palete encontrado.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📍</span>
          Onde está
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="deposito">Depósito</label>
            <select id="deposito" name="deposito" required className={campo} defaultValue="">
              <option value="" disabled>Escolha</option>
              {DEPOSITOS_FEFO.map((d) => (
                <option key={d} value={d}>Depósito {d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="rua">Rua</label>
            <select id="rua" name="rua" required className={campo} defaultValue="">
              <option value="" disabled>Escolha</option>
              {RUAS_FEFO.map((r) => (
                <option key={r} value={r}>Rua {r}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={rotulo} htmlFor="ponto">Ponto exato (opcional)</label>
          <input
            id="ponto"
            name="ponto"
            maxLength={120}
            placeholder="Ex: nível 2, no fundo da rua"
            className={campo}
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" name="rua_bloqueada" className="h-4 w-4" />
          🔒 A rua foi bloqueada
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={rotulo} htmlFor="foto">Foto (opcional)</label>
          <input id="foto" name="foto" type="file" accept="image/*" capture="environment" className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
          <textarea id="observacao" name="observacao" rows={3} maxLength={500} className={campo} />
        </div>
      </div>

      <BotaoEnviar
        textoEnviando="Enviando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        🚨 Informar quebra de FEFO
      </BotaoEnviar>
    </form>
  );
}
