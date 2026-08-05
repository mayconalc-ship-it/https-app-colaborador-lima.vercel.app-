import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIAS_POR_TIME,
  NOMES_TIME,
  type TimeRanking,
} from "@/lib/ranking-categorias";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ time?: string; mes_ano?: string }>;
}) {
  const { time: timeParam, mes_ano: mesParam } = await searchParams;
  const time: TimeRanking =
    timeParam === "AL" || timeParam === "DU" ? timeParam : "DU";

  const supabase = await createClient();
  const { data: registros } = await supabase
    .from("ranking_matinal")
    .select("categoria, mes_ano, imagem_url")
    .eq("time", time)
    .order("mes_ano", { ascending: false });

  const meses = Array.from(
    new Set((registros ?? []).map((r) => r.mes_ano)),
  ).sort((a, b) => (a < b ? 1 : -1));

  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const mesSelecionado =
    mesParam && meses.includes(mesParam) ? mesParam : (meses[0] ?? mesAtual);

  const porCategoriaNoMes = new Map<
    string,
    { mes_ano: string; imagem_url: string }
  >();
  for (const registro of registros ?? []) {
    if (registro.mes_ano === mesSelecionado) {
      porCategoriaNoMes.set(registro.categoria, registro);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ranking Super Matinal"
        subtitle="Ganhadores por categoria"
      />

      <div className="mb-4 flex gap-2">
        {(Object.keys(CATEGORIAS_POR_TIME) as TimeRanking[]).map((t) => (
          <Link
            key={t}
            href={`/ranking?time=${t}`}
            className={`flex-1 rounded-xl border py-2 text-center text-sm font-semibold ${
              t === time
                ? "border-primary bg-primary-soft text-primary"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {NOMES_TIME[t]}
          </Link>
        ))}
      </div>

      {meses.length > 0 && (
        <div className="mb-4">
          <MonthSelect meses={meses} mesSelecionado={mesSelecionado} />
        </div>
      )}

      <div className="space-y-4">
        {CATEGORIAS_POR_TIME[time].map((categoria) => {
          const registro = porCategoriaNoMes.get(categoria);
          return (
            <div
              key={categoria}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              {registro ? (
                // object-contain (e nao cover) para a foto aparecer inteira:
                // com corte, o ganhador podia ficar de fora do enquadramento.
                // min-h reserva o espaço: sem isso a imagem ainda não
                // carregada teria altura 0, quebrando o layout e o
                // carregamento sob demanda.
                <div className="flex min-h-64 items-center justify-center bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={registro.imagem_url}
                    alt={categoria}
                    loading="lazy"
                    decoding="async"
                    className="max-h-[75vh] w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-sm text-slate-400">
                  Sem foto neste mês
                </div>
              )}
              <div className="p-3">
                <span className="font-semibold text-slate-800">
                  {categoria}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
