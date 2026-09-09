"use client";

/**
 * Área e rodada.
 *
 * Mesma mecânica do painel do Armazém: troca a URL sem mexer na
 * rolagem, para quem está lendo a lista de perguntas lá embaixo não ser
 * jogado de volta ao topo a cada troca de mês.
 *
 * A área vem primeiro porque ela recorta a LISTA de rodadas: cada
 * rodada pertence a uma área só, então escolher a área é escolher de
 * qual campeonato se está falando -- Distribuição e Armazém correm
 * separados, com padrões diferentes.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AREAS } from "@/lib/areas";

const MESES_CURTOS = [
  "", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

export function FiltroDoDesafio({
  area,
  rodadas,
  rodadaId,
}: {
  area: string | null;
  rodadas: { id: number; nome: string; mes: number; temporada: number; area: string; status: string }[];
  rodadaId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ir = (mudancas: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(mudancas)) params.set(k, v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const campo =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none";

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Área</span>
        <select
          value={area ?? ""}
          // Trocar de área troca o conjunto de rodadas, então a rodada
          // escolhida deixa de existir. Zerar aqui evita cair numa tela
          // vazia com um filtro que aponta para outra área.
          onChange={(e) => ir({ area: e.target.value, rodada: "" })}
          className={campo}
        >
          <option value="">Distribuição e Armazém</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rodada</span>
        <select
          value={rodadaId === null ? "" : String(rodadaId)}
          onChange={(e) => ir({ rodada: e.target.value })}
          className={`${campo} max-w-[22rem]`}
          disabled={rodadas.length === 0}
        >
          {rodadas.length === 0 && <option value="">nenhuma rodada publicada</option>}
          {rodadas.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {MESES_CURTOS[r.mes]}/{r.temporada} · {r.area} · {r.nome}
              {r.status === "publicada" ? " (no ar)" : ""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
