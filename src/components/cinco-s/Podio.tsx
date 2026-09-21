import { formatarTaxa, rotuloCompetencia } from "@/lib/cinco-s";
import type { LugarDoPodio, PodioDoMes } from "@/lib/cinco-s-server";
import { ExportarMapa } from "./ExportarMapa";

const COR = { 1: "#FFC72C", 2: "#D9E1EA", 3: "#E3B07A" } as const;
const MEDALHA = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;
const ALTURA = { 1: 150, 2: 110, 3: 80 } as const;
const X = { 2: 60, 1: 260, 3: 460 } as const;
const LARGURA = 200;

function corta(t: string, max: number) {
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * O PÓDIO DO MÊS (pedido do dono, 21/09/2026: "ranking com os pódios dos
 * melhores de cada mês, para divulgar"). SVG montado no servidor -- o mesmo
 * botão do mapa cruzado o baixa como imagem para o grupo de WhatsApp.
 * Empate divide o lugar: as áreas empatadas aparecem juntas no degrau.
 */
export function PodioDoMesSvg({ podio, id }: { podio: PodioDoMes; id: string }) {
  const base = 330;
  const degrau = (l: LugarDoPodio) => {
    const lugar = l.lugar;
    const x = X[lugar];
    const topo = base - ALTURA[lugar];
    // Até 6 nomes no degrau; o resto vira "+N" (a lista do ano mostra todos).
    const nomes = l.areas.slice(0, 6);
    const resto = l.areas.length - nomes.length;
    const linhasNomes = [...nomes.map((n) => corta(n, 24)), ...(resto > 0 ? [`+${resto} área${resto === 1 ? "" : "s"}`] : [])];
    const alturaNomes = linhasNomes.length * 17;
    return (
      <g key={lugar}>
        <text x={x + LARGURA / 2} y={topo - alturaNomes - 34} textAnchor="middle" fontSize="30">
          {MEDALHA[lugar]}
        </text>
        {linhasNomes.map((n, i) => (
          <text
            key={n}
            x={x + LARGURA / 2}
            y={topo - alturaNomes - 6 + i * 17}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="#0f172a"
          >
            {n}
          </text>
        ))}
        <rect x={x} y={topo} width={LARGURA} height={ALTURA[lugar]} rx="8" fill={COR[lugar]} />
        <text x={x + LARGURA / 2} y={topo + 42} textAnchor="middle" fontSize="34" fontWeight="800" fill="#063573">
          {lugar}º
        </text>
        <text x={x + LARGURA / 2} y={topo + 70} textAnchor="middle" fontSize="17" fontWeight="700" fill="#063573">
          {formatarTaxa(l.conformidade)}
        </text>
      </g>
    );
  };
  return (
    <svg
      id={id}
      viewBox="0 0 720 350"
      className="w-full max-w-2xl"
      role="img"
      aria-label={`Pódio 5S de ${rotuloCompetencia(podio.competencia)}`}
    >
      <line x1="40" y1="330" x2="680" y2="330" stroke="#cbd5e1" strokeWidth="2" />
      {podio.lugares.map(degrau)}
    </svg>
  );
}

/** O bloco inteiro: o pódio do mês escolhido (com o botão) e os pódios do ano. */
export function Podios({ podios, mes }: { podios: PodioDoMes[]; mes: string | null }) {
  if (podios.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">Nenhuma auditoria finalizada neste ano.</p>;
  }
  const doMes = mes ? podios.find((p) => p.competencia === mes) : podios[0];
  return (
    <div className="space-y-5">
      {doMes ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              {rotuloCompetencia(doMes.competencia)} · {doMes.auditadas} área{doMes.auditadas === 1 ? "" : "s"} auditada
              {doMes.auditadas === 1 ? "" : "s"}
            </p>
            <ExportarMapa
              alvoId="podio-5s-svg"
              titulo={`Pódio 5S — ${rotuloCompetencia(doMes.competencia)}`}
              arquivo={`podio-5s-${doMes.competencia}.png`}
            />
          </div>
          <div className="flex justify-center rounded-xl bg-slate-50 p-2">
            <PodioDoMesSvg podio={doMes} id="podio-5s-svg" />
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma auditoria finalizada neste mês ainda.</p>
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Pódios do ano</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {podios.map((p) => (
            <li key={p.competencia} className={`px-3 py-2.5 ${p.competencia === doMes?.competencia ? "bg-amber-50/60" : ""}`}>
              <p className="text-sm font-semibold text-slate-900">{rotuloCompetencia(p.competencia)}</p>
              <ul className="mt-1 space-y-0.5">
                {p.lugares.map((l) => (
                  <li key={l.lugar} className="flex items-baseline gap-2 text-xs text-slate-700">
                    <span className="shrink-0">{MEDALHA[l.lugar]}</span>
                    <span className="min-w-0 flex-1">{l.areas.join(", ")}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatarTaxa(l.conformidade)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
