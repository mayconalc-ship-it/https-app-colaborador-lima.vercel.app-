import { formatarTaxa, rotuloCompetencia } from "@/lib/cinco-s";
import type { LugarDoPodio, PodioDoMes } from "@/lib/cinco-s-server";
import { ExportarMapa } from "./ExportarMapa";

const COR = { 1: "#FFC72C", 2: "#D9E1EA", 3: "#E3B07A" } as const;
const MEDALHA = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;
const ALTURA = { 1: 150, 2: 110, 3: 80 } as const;
const X = { 2: 50, 1: 270, 3: 490 } as const;
const LARGURA = 200;
/** Cada área no degrau ocupa duas linhas: a área e, menor, o dono. */
const POR_AREA = 34;
const MAX_AREAS = 6;

const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
/** "JOSE PEREIRA DA COSTA NETO" -> "Jose Pereira": cabe no degrau e na imagem. */
function nomeCurto(n: string | null) {
  if (!n) return "sem dono definido";
  const p = n.trim().split(/\s+/);
  const sobrenome = p.slice(1).find((x) => !PARTICULAS.has(x.toUpperCase()));
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  return sobrenome ? `${cap(p[0])} ${cap(sobrenome)}` : cap(p[0]);
}

function corta(t: string, max: number) {
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * O PÓDIO DO MÊS (pedido do dono, 21/09/2026: "ranking com os pódios dos
 * melhores de cada mês, para divulgar"; depois, "coloque o nome do dono da
 * área e a área auditada"). SVG montado no servidor -- o mesmo botão do
 * mapa cruzado o baixa como imagem para o grupo de WhatsApp. Empate divide
 * o lugar; cada área aparece com o dono que respondia por ela no mês.
 */
export function PodioDoMesSvg({ podio, id }: { podio: PodioDoMes; id: string }) {
  // Altura calculada pelo degrau com mais nomes -- nada sai cortado.
  const linhasDe = (l: LugarDoPodio) => Math.min(l.areas.length, MAX_AREAS) + (l.areas.length > MAX_AREAS ? 1 : 0);
  const cabeca = (l: LugarDoPodio) => 44 + linhasDe(l) * POR_AREA; // medalha + nomes
  const base = Math.max(...podio.lugares.map((l) => cabeca(l) + ALTURA[l.lugar])) + 16;
  const alturaSvg = base + 14;

  const degrau = (l: LugarDoPodio) => {
    const lugar = l.lugar;
    const x = X[lugar];
    const cx = x + LARGURA / 2;
    const topo = base - ALTURA[lugar];
    const mostrar = l.areas.slice(0, MAX_AREAS);
    const resto = l.areas.length - mostrar.length;
    const inicioNomes = topo - linhasDe(l) * POR_AREA - 6;
    return (
      <g key={lugar}>
        <text x={cx} y={inicioNomes - 10} textAnchor="middle" fontSize="30">
          {MEDALHA[lugar]}
        </text>
        {mostrar.map((a, i) => (
          <g key={a.area}>
            <text x={cx} y={inicioNomes + 16 + i * POR_AREA} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
              {corta(a.area, 26)}
            </text>
            <text x={cx} y={inicioNomes + 31 + i * POR_AREA} textAnchor="middle" fontSize="11.5" fill="#475569">
              {corta(`dono: ${nomeCurto(a.dono)}`, 30)}
            </text>
          </g>
        ))}
        {resto > 0 && (
          <text x={cx} y={inicioNomes + 16 + mostrar.length * POR_AREA} textAnchor="middle" fontSize="12" fill="#475569">
            +{resto} área{resto === 1 ? "" : "s"}
          </text>
        )}
        <rect x={x} y={topo} width={LARGURA} height={ALTURA[lugar]} rx="8" fill={COR[lugar]} />
        <text x={cx} y={topo + 42} textAnchor="middle" fontSize="34" fontWeight="800" fill="#063573">
          {lugar}º
        </text>
        <text x={cx} y={topo + 70} textAnchor="middle" fontSize="17" fontWeight="700" fill="#063573">
          {formatarTaxa(l.conformidade)}
        </text>
      </g>
    );
  };
  return (
    <svg
      id={id}
      viewBox={`0 0 740 ${alturaSvg}`}
      className="w-full max-w-2xl"
      role="img"
      aria-label={`Pódio 5S de ${rotuloCompetencia(podio.competencia)}`}
    >
      <line x1="30" y1={base} x2="710" y2={base} stroke="#cbd5e1" strokeWidth="2" />
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
              <ul className="mt-1 space-y-1">
                {p.lugares.map((l) => (
                  <li key={l.lugar} className="flex items-start gap-2 text-xs text-slate-700">
                    <span className="shrink-0">{MEDALHA[l.lugar]}</span>
                    <span className="min-w-0 flex-1">
                      {l.areas.map((a, i) => (
                        <span key={a.area}>
                          <span className="font-medium text-slate-900">{a.area}</span>
                          <span className="text-slate-500"> ({nomeCurto(a.dono)})</span>
                          {i < l.areas.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </span>
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
