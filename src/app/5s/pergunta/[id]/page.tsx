import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { getContexto5S, nomesDe } from "@/lib/cinco-s-server";
import {
  COR_STATUS_NC,
  ROTULO_SENSO,
  ROTULO_STATUS_NC,
  ehCompetencia,
  rotuloCompetencia,
  type Senso,
  type StatusNC,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/**
 * O fundo do poço do BI: uma pergunta específica.
 *
 * O requisito pedia que a liderança conseguisse sair de um indicador
 * consolidado e chegar ao problema. Esta é a última parada dessa
 * descida -- "5.2 reprova em 42% das auditorias" vira "reprova NESTAS
 * áreas, com ESTAS ações abertas, com ESTES responsáveis".
 *
 * É a tela que responde se o problema é de uma área ou é sistêmico. Se
 * o item reprova em quinze áreas, o plano de ação por área nunca vai
 * resolver -- o que falta é padrão, treinamento ou recurso.
 */
export default async function PerguntaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  // Mesma porta do BI: quem participa do programa entra.
  const ctx = await getContexto5S();
  if (!ctx) redirect("/");
  if (!ctx.temAcesso) redirect("/5s");
  const revendaId = ctx.revendaId;

  const { id } = await params;
  const { mes } = await searchParams;
  const competencia = ehCompetencia(mes) ? mes : null;

  const admin = createAdminClient();

  const { data: pergunta } = await admin
    .from("cinco_s_perguntas")
    .select("id, codigo, texto, senso")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!pergunta) notFound();

  // As respostas desta pergunta, com a auditoria e a área de cada uma.
  // Um join só -- pedir a área de cada resposta separadamente seria o
  // N+1 que o requisito manda evitar.
  let consulta = admin
    .from("cinco_s_respostas")
    .select(
      "valor, observacao, cinco_s_auditorias!inner(id, area_id, status, competencia, planejada_para, revenda_id, cinco_s_areas!inner(nome))",
    )
    .eq("pergunta_id", id)
    .eq("cinco_s_auditorias.revenda_id", revendaId)
    .eq("cinco_s_auditorias.status", "finalizada")
    .limit(2000);

  if (competencia) {
    consulta = consulta.eq("cinco_s_auditorias.competencia", `${competencia}-01`);
  }

  const [{ data: respostas }, { data: acoes }] = await Promise.all([
    consulta,
    admin
      .from("cinco_s_nao_conformidades")
      .select(
        "id, descricao, status, prazo, responsavel_id, cinco_s_areas!inner(nome)",
      )
      .eq("pergunta_id", id)
      .eq("revenda_id", revendaId)
      .order("status")
      .limit(50),
  ]);

  const linhas = (respostas ?? []).map((r) => {
    const a = umObjeto(r.cinco_s_auditorias) as {
      id: string;
      area_id: string;
      competencia: string;
      planejada_para: string;
      cinco_s_areas: unknown;
    };
    return {
      valor: r.valor as "sim" | "nao" | "na",
      observacao: r.observacao,
      auditoriaId: a.id,
      areaId: a.area_id,
      areaNome: (umObjeto(a.cinco_s_areas) as { nome: string }).nome,
      competencia: a.competencia?.slice(0, 7) ?? "",
      data: a.planejada_para,
    };
  });

  const ok = linhas.filter((l) => l.valor === "sim").length;
  const nok = linhas.filter((l) => l.valor === "nao").length;
  const na = linhas.filter((l) => l.valor === "na").length;
  const taxaNok = ok + nok > 0 ? Math.round((nok / (ok + nok)) * 1000) / 10 : null;

  // Por área: quantas vezes reprovou. É o que separa "problema da
  // Portaria" de "problema da empresa".
  const porArea = new Map<
    string,
    { nome: string; nok: number; total: number; areaId: string }
  >();
  for (const l of linhas) {
    if (l.valor === "na") continue;
    const atual = porArea.get(l.areaId) ?? {
      nome: l.areaNome,
      nok: 0,
      total: 0,
      areaId: l.areaId,
    };
    atual.total++;
    if (l.valor === "nao") atual.nok++;
    porArea.set(l.areaId, atual);
  }

  const areasAfetadas = Array.from(porArea.values())
    .filter((a) => a.nok > 0)
    .sort((a, b) => b.nok / b.total - a.nok / a.total);

  // Evolução mês a mês do próprio item.
  const porMes = new Map<string, { nok: number; total: number }>();
  for (const l of linhas) {
    if (l.valor === "na" || !l.competencia) continue;
    const atual = porMes.get(l.competencia) ?? { nok: 0, total: 0 };
    atual.total++;
    if (l.valor === "nao") atual.nok++;
    porMes.set(l.competencia, atual);
  }
  const meses = Array.from(porMes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);

  const nomes = await nomesDe(
    Array.from(
      new Set(
        (acoes ?? [])
          .map((a) => a.responsavel_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ),
  );

  const sistemica = areasAfetadas.length >= 5;

  return (
    <div>
      <PageHeader
        title={`Item ${pergunta.codigo}`}
        subtitle={`${ROTULO_SENSO[pergunta.senso as Senso]}${
          competencia ? ` · ${rotuloCompetencia(competencia)}` : " · todo o histórico"
        }`}
        fecharHref={`/5s/bi${competencia ? `?mes=${competencia}` : ""}`}
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm leading-snug text-slate-700">{pergunta.texto}</p>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <Mini valor={`${taxaNok?.toFixed(0) ?? "—"}%`} rotulo="reprovação" tom="ruim" />
        <Mini valor={String(nok)} rotulo="vezes NOK" />
        <Mini valor={String(ok)} rotulo="vezes OK" tom="bom" />
        <Mini valor={String(na)} rotulo="não se aplica" />
      </div>

      {/* A leitura que a tela existe para dar. */}
      <div
        className={`mb-4 rounded-2xl p-4 text-sm ${
          sistemica
            ? "bg-red-50 text-red-900"
            : areasAfetadas.length > 0
              ? "bg-amber-50 text-amber-900"
              : "bg-green-50 text-green-900"
        }`}
      >
        {areasAfetadas.length === 0 ? (
          <>Este item nunca reprovou no recorte selecionado.</>
        ) : sistemica ? (
          <>
            <strong>Problema sistêmico.</strong> Reprova em{" "}
            {areasAfetadas.length} áreas diferentes — plano de ação por área
            não resolve sozinho. Vale olhar padrão, treinamento ou recurso.
          </>
        ) : (
          <>
            <strong>Problema localizado.</strong> Concentrado em{" "}
            {areasAfetadas.length} área{areasAfetadas.length === 1 ? "" : "s"}:{" "}
            {areasAfetadas
              .slice(0, 3)
              .map((a) => a.nome)
              .join(", ")}
            . Tratável pelo plano de ação da área.
          </>
        )}
      </div>

      {meses.length > 1 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Reprovação mês a mês
          </h2>
          <div className="flex items-end gap-1" style={{ height: 90 }}>
            {meses.map(([m, v]) => {
              const pct = v.total > 0 ? (v.nok / v.total) * 100 : 0;
              return (
                <div key={m} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-slate-400">
                    {pct.toFixed(0)}
                  </span>
                  <div
                    className={`w-full rounded-t ${
                      pct >= 50 ? "bg-red-500" : pct > 0 ? "bg-amber-400" : "bg-green-400"
                    }`}
                    style={{ height: `${Math.max(3, pct * 0.55)}px` }}
                  />
                  <span className="text-[10px] text-slate-400">
                    {m.slice(5)}/{m.slice(2, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {areasAfetadas.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Áreas afetadas
            <span className="ml-2 font-normal text-slate-400">
              ({areasAfetadas.length})
            </span>
          </h2>
          <ul className="space-y-2">
            {areasAfetadas.map((a) => (
              <li key={a.areaId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                  {a.nome}
                </span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${(a.nok / a.total) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {a.nok}/{a.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(acoes ?? []).length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Ações relacionadas
              <span className="ml-2 font-normal text-slate-400">
                ({(acoes ?? []).length})
              </span>
            </h2>
            <Link href="/5s/acoes" className="text-xs font-semibold text-primary underline">
              Plano de ação
            </Link>
          </div>
          <ul className="space-y-2">
            {(acoes ?? []).map((a) => (
              <li key={a.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-slate-700">
                    {a.descricao}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_STATUS_NC[a.status as StatusNC]}`}
                  >
                    {ROTULO_STATUS_NC[a.status as StatusNC]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {(umObjeto(a.cinco_s_areas) as { nome: string }).nome}
                  {a.responsavel_id && ` · ${nomes.get(a.responsavel_id) ?? "—"}`}
                  {a.prazo && ` · até ${a.prazo.split("-").reverse().join("/")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* As observações que o auditor escreveu são o texto mais útil do
          módulo: dizem, na língua de quem estava lá, o que está errado. */}
      {linhas.some((l) => l.valor === "nao" && l.observacao) && (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
            O que os auditores escreveram
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {linhas
              .filter((l) => l.valor === "nao" && l.observacao)
              .slice(0, 40)
              .map((l, i) => (
                <li key={`${l.auditoriaId}-${i}`} className="p-3">
                  <p className="text-sm text-slate-600">{l.observacao}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {l.areaNome} · {l.data.split("-").reverse().join("/")}
                  </p>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function umObjeto(valor: unknown) {
  return Array.isArray(valor) ? valor[0] : valor;
}

function Mini({
  valor,
  rotulo,
  tom = "neutro",
}: {
  valor: string;
  rotulo: string;
  tom?: "neutro" | "bom" | "ruim";
}) {
  const cor = {
    neutro: "text-slate-700",
    bom: "text-green-600",
    ruim: "text-red-600",
  }[tom];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
