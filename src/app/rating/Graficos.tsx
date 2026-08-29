import { COR_AZUL, COR_VERDE } from "@/components/indicadores/Graficos";

/**
 * O gráfico que é só do Rating. O calendário e as barras moram em
 * components/indicadores/Graficos.tsx, compartilhados com o Refugo.
 */

/**
 * Distribuição das notas de 1 a 5. Ordinal, não categórico: por isso uma
 * cor só, com a barra de 5 estrelas em verde para separar a meta do
 * resto -- e o rótulo escrito do lado, nunca só a cor.
 */
export function DistribuicaoDeNotas({ contagem }: { contagem: Record<number, number> }) {
  const total = Object.values(contagem).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const maior = Math.max(...Object.values(contagem));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">Distribuição das notas</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Quantas entregas suas receberam cada nota no período
      </p>

      <ul className="mt-3 space-y-2">
        {[5, 4, 3, 2, 1].map((n) => {
          const v = contagem[n] ?? 0;
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <li key={n} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">
                {n} <span className="text-amber-400">★</span>
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maior > 0 ? (v / maior) * 100 : 0}%`,
                    background: n === 5 ? COR_VERDE : COR_AZUL,
                  }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-600">
                {v} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
