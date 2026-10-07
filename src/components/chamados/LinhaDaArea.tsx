"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import type { Local } from "@/lib/chamados";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type Acao = (fd: FormData) => Promise<ResultadoAcao>;

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

/**
 * UMA ÁREA NO ORGANIZADOR (Admin › Chamados, 07/10/2026, pedido do dono).
 *
 * Organizar é o que se faz mais: trocar o setor (a lista, que salva ao
 * escolher) e subir/descer (as setas). Nome e liga/desliga são raros e
 * ficam no lápis, que abre embaixo da linha.
 */
export function LinhaDaArea({
  local: l,
  setores,
  primeira,
  ultima,
  mover,
  ordenar,
  editar,
  alternar,
}: {
  local: Local;
  setores: string[];
  primeira: boolean;
  ultima: boolean;
  mover: Acao;
  ordenar: Acao;
  editar: Acao;
  alternar: Acao;
}) {
  const [aberto, setAberto] = useState(false);
  const seta =
    "flex h-6 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent";

  return (
    <li className={l.ativo ? "" : "bg-slate-50"}>
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="flex shrink-0 flex-col">
          <BotaoNoLugar acao={ordenar} campos={{ id: l.id, direcao: "subir" }} className={seta} disabled={primeira} title={`Subir ${l.nome}`} textoEnviando="…">
            <ChevronUp size={16} aria-label="Subir" />
          </BotaoNoLugar>
          <BotaoNoLugar acao={ordenar} campos={{ id: l.id, direcao: "descer" }} className={seta} disabled={ultima} title={`Descer ${l.nome}`} textoEnviando="…">
            <ChevronDown size={16} aria-label="Descer" />
          </BotaoNoLugar>
        </div>

        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${l.ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>{l.nome}</span>
          {(l.area5s || !l.ativo) && (
            <span className="block text-[11px] text-slate-400">
              {l.area5s && <span className="font-semibold text-emerald-700">{l.veio_do_5s ? "do 5S" : "também no 5S"}</span>}
              {l.area5s && !l.ativo && " · "}
              {!l.ativo && "desligada: fora do formulário"}
            </span>
          )}
        </span>

        <FormNoLugar acao={mover} className="shrink-0">
          <input type="hidden" name="id" value={l.id} />
          <select
            name="grupo"
            defaultValue={l.grupo}
            aria-label={`Setor de ${l.nome}`}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-primary focus:outline-none sm:w-36"
          >
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="">Sem setor</option>
          </select>
        </FormNoLugar>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={`Editar ${l.nome}`}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${aberto ? "bg-primary-soft text-primary-dark" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
        >
          <Pencil size={15} aria-hidden />
        </button>
      </div>

      {aberto && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-3">
          <FormNoLugar acao={editar} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_5rem_auto] sm:items-end">
            <input type="hidden" name="id" value={l.id} />
            <label>
              <span className={rotulo}>Setor</span>
              <input name="grupo" list="grupos-de-area" defaultValue={l.grupo} maxLength={60} className={campo} />
            </label>
            <label>
              <span className={rotulo}>Nome{l.veio_do_5s ? " (do cadastro do 5S)" : ""}</span>
              <input
                name="nome"
                required
                defaultValue={l.nome}
                maxLength={80}
                readOnly={l.veio_do_5s}
                className={`${campo} ${l.veio_do_5s ? "bg-slate-50 text-slate-500" : ""}`}
              />
            </label>
            <label>
              <span className={rotulo}>Ordem</span>
              <input name="ordem" type="number" min={0} max={999} defaultValue={l.ordem} className={campo} />
            </label>
            <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Salvar
            </BotaoEnviar>
          </FormNoLugar>
          {l.veio_do_5s ? (
            <p className="text-[11px] text-slate-500">Nome e liga/desliga desta área vêm do cadastro do 5S (Admin › 5S).</p>
          ) : (
            <BotaoNoLugar
              acao={alternar}
              campos={{ id: l.id, ativo: l.ativo ? "0" : "1" }}
              perigo={l.ativo}
              confirmacao={l.ativo ? `Desligar "${l.nome}"?` : undefined}
              detalhe="A área sai da lista do formulário. Os chamados antigos continuam."
              rotuloConfirmar="Desligar"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {l.ativo ? "⏻ Desligar" : "⏻ Ligar de novo"}
            </BotaoNoLugar>
          )}
        </div>
      )}
    </li>
  );
}
