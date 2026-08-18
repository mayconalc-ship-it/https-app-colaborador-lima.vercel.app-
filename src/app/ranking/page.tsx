import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { createClient } from "@/lib/supabase/server";
import { NOMES_TIME, TIMES, ehTimeValido, type TimeRanking } from "@/lib/ranking-categorias";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ time?: string; mes_ano?: string }>;
}) {
  const { time: timeParam, mes_ano: mesParam } = await searchParams;
  const time: TimeRanking =
    timeParam && ehTimeValido(timeParam) ? timeParam : "DU";

  const supabase = await createClient();
  const { data: registros } = await supabase
    .from("ranking_matinal")
    .select("id, categoria, mes_ano, imagem_url, criado_em")
    .eq("time", time)
    .order("mes_ano", { ascending: false })
    // Dentro do mes vale a ordem de lancamento: quem publica decide a
    // sequencia simplesmente subindo as fotos na ordem que quer exibir.
    .order("criado_em", { ascending: true });

  const meses = Array.from(
    new Set((registros ?? []).map((r) => r.mes_ano)),
  ).sort((a, b) => (a < b ? 1 : -1));

  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const mesSelecionado =
    mesParam && meses.includes(mesParam) ? mesParam : (meses[0] ?? mesAtual);

  // So entra na tela o que foi realmente lancado no mes. Antes a lista de
  // categorias era fixa e as nao premiadas viravam blocos vazios.
  const doMes = (registros ?? []).filter((r) => r.mes_ano === mesSelecionado);

  return (
    <div>
      <PageHeader
        title="Ranking Super Matinal"
        subtitle="Ganhadores por categoria"
      />

      <div className="mb-4 flex gap-2">
        {TIMES.map((t) => (
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

      {doMes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum ganhador publicado neste mês.
        </div>
      ) : (
        <div className="space-y-4">
          {doMes.map((registro) => (
            <div
              key={registro.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              {/* object-contain (e nao cover) para a foto aparecer inteira:
                  com corte, o ganhador podia ficar de fora do enquadramento.
                  min-h reserva o espaço: sem isso a imagem ainda não
                  carregada teria altura 0, quebrando o layout e o
                  carregamento sob demanda. */}
              <div className="flex min-h-64 items-center justify-center bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={registro.imagem_url}
                  alt={registro.categoria}
                  loading="lazy"
                  decoding="async"
                  className="max-h-[75vh] w-full object-contain"
                />
              </div>
              <div className="p-3">
                <span className="font-semibold text-slate-800">
                  {registro.categoria}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
