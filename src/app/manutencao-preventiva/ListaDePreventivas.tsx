"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { BarraDoPrazo, SeloDoPrazo } from "@/components/manutencao/PrazoDaPreventiva";
import type { Prazo } from "@/lib/manutencao-preventiva";
import { cancelarPreventiva, iniciarPreventiva } from "./actions";

export type LinhaDaLista = {
  chave: string;
  modeloId: string;
  equipamentoId: string | null;
  emoji: string;
  /** "Ar-condicionado", "Gerador" -- o grupo. */
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

const vencida = (l: LinhaDaLista) => l.prazo.estado === "atrasada" || l.prazo.estado === "vence_hoje";

function noFiltro(l: LinhaDaLista, f: Filtro) {
  if (f === "todas") return true;
  if (f === "vencidas") return vencida(l);
  if (f === "logo") return l.prazo.estado === "proxima";
  return l.prazo.estado === "em_dia";
}

/**
 * A lista que acompanha e cobra, AGRUPADA POR TIPO (16/11/2026, pedido do
 * dono: "traga todas as manutenções agrupadas").
 *
 * - Os quatro números de cima são o resumo E o filtro.
 * - Cada tipo (Ar-condicionado, Câmara fria, Gerador) é uma sanfona com o
 *   placar no cabeçalho -- "2 vencidas · 13 de 16 em dia" -- e a barra de
 *   quantos estão em dia. Abre sozinha a que tem algo vencendo.
 * - Dentro, uma linha por aparelho, do mais urgente ao mais folgado.
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
  const [busca, setBusca] = useState("");
  /** Sanfonas mexidas à mão: true = aberta. As demais seguem o padrão. */
  const [mexidas, setMexidas] = useState<Record<string, boolean>>({});

  const termo = busca.trim().toLowerCase();
  const visiveis = linhas.filter(
    (l) => noFiltro(l, filtro) && (!termo || `${l.tipo} ${l.titulo} ${l.detalhe ?? ""}`.toLowerCase().includes(termo)),
  );

  // Grupos na ordem do mais urgente: quem tem vencida vem primeiro.
  const grupos = useMemo(() => {
    const m = new Map<string, { tipo: string; emoji: string; todas: LinhaDaLista[] }>();
    for (const l of linhas) {
      if (!m.has(l.tipo)) m.set(l.tipo, { tipo: l.tipo, emoji: l.emoji, todas: [] });
      m.get(l.tipo)!.todas.push(l);
    }
    return [...m.values()].sort(
      (a, b) =>
        Math.min(...a.todas.map((l) => l.prazo.diasParaVencer)) - Math.min(...b.todas.map((l) => l.prazo.diasParaVencer)) ||
        a.tipo.localeCompare(b.tipo, "pt-BR"),
    );
  }, [linhas]);

  const grupoDoDestaque = linhas.find((l) => l.chave === destaque)?.tipo ?? null;

  useEffect(() => {
    if (!destaque) return;
    document.getElementById(`alvo-${destaque}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);

  if (linhas.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma preventiva cadastrada nesta revenda ainda.</p>;
  }

  return (
    <div>
      {/* Resumo que também filtra */}
      <div className="grid grid-cols-4 gap-1.5">
        {FILTROS.map((f) => {
          const n = linhas.filter((l) => noFiltro(l, f.id)).length;
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

      {linhas.length > 8 && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar código ou local"
          className="mt-3 w-full rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-primary focus:outline-none"
        />
      )}

      {visiveis.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
          {filtro === "vencidas" ? "🎉 Nenhuma preventiva vencida." : "Nada neste filtro."}
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {grupos.map((g) => {
            const doGrupo = visiveis.filter((l) => l.tipo === g.tipo);
            if (doGrupo.length === 0) return null;
            const nVencidas = g.todas.filter(vencida).length;
            const nLogo = g.todas.filter((l) => l.prazo.estado === "proxima").length;
            const nEmDia = g.todas.filter((l) => l.prazo.estado === "em_dia").length;
            const pct = Math.round((nEmDia / g.todas.length) * 100);
            // Padrão: abre o grupo com algo vencendo, o do destaque, e
            // todos quando há filtro ou busca (aí a pessoa já escolheu o que ver).
            const padrao =
              filtro !== "todas" || termo !== "" || nVencidas + nLogo > 0 || g.tipo === grupoDoDestaque || grupos.length === 1;
            const aberto = mexidas[g.tipo] ?? padrao;
            return (
              <section key={g.tipo} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setMexidas((m) => ({ ...m, [g.tipo]: !aberto }))}
                  aria-expanded={aberto}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="text-2xl" aria-hidden>
                    {g.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{g.tipo}</span>
                    <span className="block text-xs font-semibold text-slate-500">
                      {nEmDia} de {g.todas.length} em dia
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <span
                        className={`block h-full rounded-full ${nVencidas ? "bg-red-500" : nLogo ? "bg-amber-400" : "bg-emerald-500"}`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </span>
                    {(nVencidas > 0 || nLogo > 0) && (
                      <span className="mt-1 flex gap-2 text-[11px] font-bold">
                        {nVencidas > 0 && <span className="text-red-700">{nVencidas} vencida{nVencidas === 1 ? "" : "s"}</span>}
                        {nLogo > 0 && <span className="text-amber-700">{nLogo} vence{nLogo === 1 ? "" : "m"} logo</span>}
                      </span>
                    )}
                  </span>
                  <span className={`text-slate-400 transition ${aberto ? "rotate-90" : ""}`} aria-hidden>
                    ›
                  </span>
                </button>

                {aberto && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {doGrupo.map((l) => (
                      <LinhaDoAparelho key={l.chave} l={l} destacada={destaque === l.chave} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Uma linha por aparelho: nome, prazo, barra do ciclo e o botão ao lado. */
function LinhaDoAparelho({ l, destacada }: { l: LinhaDaLista; destacada: boolean }) {
  return (
    <li id={`alvo-${l.chave}`} className={`px-3.5 py-2.5 ${destacada ? "bg-primary-soft/50" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* Nome numa linha só dele: em tela estreita, o selo ao lado
              cortava justamente o local, que é como o técnico acha o aparelho. */}
          <p className="truncate text-sm font-semibold text-slate-900">{l.titulo}</p>
          <div className="mt-1 flex items-center gap-2">
            <SeloDoPrazo prazo={l.prazo} curto />
            <div className="min-w-0 flex-1">
              <BarraDoPrazo prazo={l.prazo} />
            </div>
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {l.detalhe ? `${l.detalhe} · ` : ""}a cada {l.periodicidadeDias} d ·{" "}
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

        {l.abertaId ? (
          <div className="flex shrink-0 flex-col gap-1">
            <Link
              href={`/manutencao-preventiva/${l.abertaId}`}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-amber-600"
            >
              ▶️ Continuar
            </Link>
            <BotaoExcluir
              action={cancelarPreventiva}
              campos={{ execucao_id: l.abertaId }}
              confirmacao="Cancelar esta preventiva? Ela é apagada e não entra no histórico."
              rotuloConfirmar="Cancelar preventiva"
              className="w-full rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              ✕ Cancelar
            </BotaoExcluir>
          </div>
        ) : (
          <form action={iniciarPreventiva} className="shrink-0">
            <input type="hidden" name="modelo_id" value={l.modeloId} />
            {l.equipamentoId && <input type="hidden" name="equipamento_id" value={l.equipamentoId} />}
            <BotaoEnviar
              textoEnviando="..."
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                l.prazo.estado === "em_dia"
                  ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "bg-primary text-white hover:bg-primary-dark"
              }`}
            >
              Fazer
            </BotaoEnviar>
          </form>
        )}
      </div>
    </li>
  );
}
