import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { RankingForm } from "@/components/RankingForm";
import { RankingItem } from "@/components/RankingItem";
import {
  NOMES_TIME,
  SUGESTOES_POR_TIME,
  TIMES,
  ehTimeValido,
  type TimeRanking,
} from "@/lib/ranking-categorias";
import { enviarRanking, excluirRanking, atualizarRanking } from "./actions";

function formatarMes(mesAno: string) {
  const [ano, mes] = mesAno.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function AdminRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("ranking", "ver");
  const { erro, sucesso } = await searchParams;

  const supabase = await createClient();
  const { data: historico } = await supabase
    .from("ranking_matinal")
    .select("id, mes_ano, time, categoria, imagem_url")
    .order("mes_ano", { ascending: false })
    .order("time", { ascending: true })
    .order("categoria", { ascending: true });

  // Agrupa por mês e, dentro do mês, por time: com um ano de premiações a
  // lista passaria de cem fotos e a conferência ficaria impossível.
  const porMes = new Map<string, NonNullable<typeof historico>>();
  for (const item of historico ?? []) {
    if (!porMes.has(item.mes_ano)) porMes.set(item.mes_ano, []);
    porMes.get(item.mes_ano)!.push(item);
  }
  const meses = Array.from(porMes.keys()).sort((a, b) => (a < b ? 1 : -1));

  // Autocompletar: primeiro o que a revenda ja usou (na ordem do mais
  // recente), depois as sugestoes padrao que ainda nao apareceram. Evita
  // que a mesma premiacao vire "Motorista Sede" num mes e "motorista sede"
  // no outro, virando duas categorias diferentes na tela do colaborador.
  const sugestoes = Object.fromEntries(
    TIMES.map((t) => [t, [] as string[]]),
  ) as Record<TimeRanking, string[]>;
  for (const item of historico ?? []) {
    if (!ehTimeValido(item.time)) continue;
    if (!sugestoes[item.time].includes(item.categoria)) {
      sugestoes[item.time].push(item.categoria);
    }
  }
  for (const t of TIMES) {
    for (const padrao of SUGESTOES_POR_TIME[t]) {
      if (!sugestoes[t].includes(padrao)) sugestoes[t].push(padrao);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ranking Super Matinal"
        subtitle="Enviar, editar ou excluir a foto do ganhador"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <RankingForm action={enviarRanking} sugestoes={sugestoes} />

      <h2 className="mb-2 font-semibold text-slate-700">
        Fotos cadastradas ({historico?.length ?? 0})
      </h2>

      {meses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma foto cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {meses.map((mes, indiceMes) => {
            const doMes = porMes.get(mes)!;

            const porTime = new Map<string, typeof doMes>();
            for (const item of doMes) {
              if (!porTime.has(item.time)) porTime.set(item.time, []);
              porTime.get(item.time)!.push(item);
            }

            return (
              <details
                key={mes}
                // Só o mês mais recente abre sozinho: é onde o trabalho está.
                open={indiceMes === 0}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 p-4">
                  <span className="font-semibold text-slate-800">
                    {formatarMes(mes)}
                  </span>
                  <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
                    {doMes.length} foto{doMes.length > 1 ? "s" : ""}
                  </span>
                </summary>

                <div className="border-t border-slate-100">
                  {Array.from(porTime.entries()).map(([time, itens]) => (
                    <div key={time}>
                      <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {NOMES_TIME[time as TimeRanking] ?? time} ·{" "}
                        {itens.length} categoria{itens.length > 1 ? "s" : ""}
                      </p>
                      <div className="divide-y divide-slate-100">
                        {itens.map((item) => (
                          <RankingItem
                            key={item.id}
                            registro={item}
                            sugestoes={sugestoes}
                            onAtualizar={atualizarRanking}
                            onExcluir={excluirRanking}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
