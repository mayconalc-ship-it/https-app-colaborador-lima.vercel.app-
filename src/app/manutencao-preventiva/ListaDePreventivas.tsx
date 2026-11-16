"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BarraDoPrazo, SeloDoPrazo } from "@/components/manutencao/PrazoDaPreventiva";
import type { Prazo } from "@/lib/manutencao-preventiva";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { cancelarPreventiva, iniciarPreventiva } from "./actions";

export type LinhaDaLista = {
  chave: string;
  modeloId: string;
  equipamentoId: string | null;
  emoji: string;
  /** "Ar-condicionado", "Gerador" -- o filtro por tipo. */
  tipo: string;
  titulo: string;
  detalhe: string | null;
  periodicidadeDias: number;
  ultima: { id: string; quando: string; por: string | null; alertas: number } | null;
  prazo: Prazo;
  abertaId: string | null;
};

type Filtro = "vencidas" | "logo" | "em_dia" | "todas";

const FILTROS: { id: Filtro; rotulo: string; ativo: string }[] = [
  { id: "vencidas", rotulo: "Vencidas", ativo: "border-red-500 bg-red-500 text-white" },
  { id: "logo", rotulo: "Vencem logo", ativo: "border-amber-500 bg-amber-500 text-white" },
  { id: "em_dia", rotulo: "Em dia", ativo: "border-emerald-600 bg-emerald-600 text-white" },
  { id: "todas", rotulo: "Todas", ativo: "border-slate-800 bg-slate-800 text-white" },
];

function noFiltro(l: LinhaDaLista, f: Filtro) {
  if (f === "todas") return true;
  if (f === "vencidas") return l.prazo.estado === "atrasada" || l.prazo.estado === "vence_hoje";
  if (f === "logo") return l.prazo.estado === "proxima";
  return l.prazo.estado === "em_dia";
}

/**
 * A lista que acompanha e cobra (16/11/2026).
 *
 * Os chips de cima são o resumo E o filtro -- um toque em "Vencidas"
 * mostra só elas, sem ir ao servidor. A ordem já vem por urgência; a
 * barra mostra quanto do ciclo passou, e fica vermelha ao vencer.
 */
export function ListaDePreventivas({
  linhas,
  filtroInicial,
  destaque,
}: {
  linhas: LinhaDaLista[];
  filtroInicial: string | null;
  destaque: string | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>(
    FILTROS.some((f) => f.id === filtroInicial) ? (filtroInicial as Filtro) : "todas",
  );
  const [tipo, setTipo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const tipos = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (!m.has(l.tipo)) m.set(l.tipo, l.emoji);
    return [...m];
  }, [linhas]);

  const doTipo = linhas.filter((l) => !tipo || l.tipo === tipo);
  const contagem = (f: Filtro) => doTipo.filter((l) => noFiltro(l, f)).length;
  const termo = busca.trim().toLowerCase();
  const visiveis = doTipo.filter(
    (l) => noFiltro(l, filtro) && (!termo || `${l.tipo} ${l.titulo} ${l.detalhe ?? ""}`.toLowerCase().includes(termo)),
  );

  useEffect(() => {
    if (!destaque) return;
    document.getElementById(`alvo-${destaque}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);

  if (linhas.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        Nenhuma preventiva cadastrada nesta revenda ainda.
      </p>
    );
  }

  return (
    <div>
      {/* Resumo que também filtra */}
      <div className="grid grid-cols-4 gap-1.5">
        {FILTROS.map((f) => {
          const n = f.id === "todas" ? doTipo.length : contagem(f.id);
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={ativo}
              className={`rounded-xl border px-1 py-2 text-center transition ${
                ativo ? f.ativo : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <span className="block text-lg font-bold leading-none">{n}</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase leading-tight">{f.rotulo}</span>
            </button>
          );
        })}
      </div>

      {(tipos.length > 1 || linhas.length > 8) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tipos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setTipo(null)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  tipo === null ? "border-primary bg-primary-soft text-primary-dark" : "border-slate-200 text-slate-600"
                }`}
              >
                Todos
              </button>
              {tipos.map(([t, emoji]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t === tipo ? null : t)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    tipo === t ? "border-primary bg-primary-soft text-primary-dark" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {emoji} {t}{" "}
                  <span className="font-normal opacity-70">
                    {linhas.filter((l) => l.tipo === t && l.prazo.estado === "em_dia").length}/
                    {linhas.filter((l) => l.tipo === t).length} em dia
                  </span>
                </button>
              ))}
            </>
          )}
          {linhas.length > 8 && (
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar código ou local"
              className="min-w-0 flex-1 basis-40 rounded-full border border-slate-200 px-3 py-1 text-sm focus:border-primary focus:outline-none"
            />
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
          {filtro === "vencidas" ? "🎉 Nenhuma preventiva vencida." : "Nada neste filtro."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visiveis.map((l) => (
            <li
              key={l.chave}
              id={`alvo-${l.chave}`}
              className={`rounded-2xl border bg-white p-3 shadow-sm ${
                destaque === l.chave ? "border-primary ring-2 ring-primary/30" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  {l.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-bold leading-tight text-slate-900">
                      {l.equipamentoId && <span className="block text-[11px] font-semibold text-slate-400">{l.tipo}</span>}
                      <span className="block truncate">{l.titulo}</span>
                    </p>
                    <SeloDoPrazo prazo={l.prazo} curto />
                  </div>
                  <div className="mt-1.5">
                    <BarraDoPrazo prazo={l.prazo} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    A cada {l.periodicidadeDias} d ·{" "}
                    {l.ultima ? (
                      <Link href={`/manutencao-preventiva/${l.ultima.id}`} className="hover:underline">
                        última {l.ultima.quando.split(" ")[0]}
                        {l.ultima.alertas > 0 && <span className="font-bold text-red-700"> · ⚠️ {l.ultima.alertas}</span>}
                      </Link>
                    ) : (
                      "nunca feita"
                    )}
                  </p>
                </div>
              </div>

              {l.abertaId ? (
                <div className="mt-2.5 flex gap-2">
                  <Link
                    href={`/manutencao-preventiva/${l.abertaId}`}
                    className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    ▶️ Continuar
                  </Link>
                  <BotaoExcluir
                    action={cancelarPreventiva}
                    campos={{ execucao_id: l.abertaId }}
                    confirmacao="Cancelar esta preventiva? Ela é apagada e não entra no histórico."
                    rotuloConfirmar="Cancelar preventiva"
                    className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    ✕ Cancelar
                  </BotaoExcluir>
                </div>
              ) : (
                <form action={iniciarPreventiva} className="mt-2.5">
                  <input type="hidden" name="modelo_id" value={l.modeloId} />
                  {l.equipamentoId && <input type="hidden" name="equipamento_id" value={l.equipamentoId} />}
                  <BotaoEnviar
                    textoEnviando="Abrindo..."
                    className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
                      l.prazo.estado === "em_dia"
                        ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "bg-primary text-white hover:bg-primary-dark"
                    }`}
                  >
                    Fazer a preventiva
                  </BotaoEnviar>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
