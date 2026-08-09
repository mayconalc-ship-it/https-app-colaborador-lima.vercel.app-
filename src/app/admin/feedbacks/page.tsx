import Link from "next/link";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import {
  OCORRENCIAS,
  rotuloNota,
  rotuloOcorrencia,
} from "@/lib/feedback-ocorrencias";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

export default async function AdminFeedbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireModulo("feedbacks", "ver");
  const { dias: diasParam } = await searchParams;
  const dias = PERIODOS.some((p) => String(p.dias) === diasParam)
    ? Number(diasParam)
    : 30;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");

  const { data: feedbacks } = await admin
    .from("feedback_rota")
    .select("id, colaborador_id, nota, rota, ocorrencias, comentario, criado_em")
    .eq("revenda_id", revendaId)
    .gte("criado_em", desde.toISOString())
    .order("criado_em", { ascending: false });

  const ids = Array.from(
    new Set((feedbacks ?? []).map((f) => f.colaborador_id)),
  );

  const { data: perfis } = ids.length
    ? await admin.from("profiles").select("id, nome, cargo").in("id", ids)
    : { data: [] };

  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p]));

  const totalFeedbacks = feedbacks?.length ?? 0;
  const mediaNota = totalFeedbacks
    ? (feedbacks!.reduce((soma, f) => soma + f.nota, 0) / totalFeedbacks).toFixed(1)
    : "—";

  const contagemOcorrencias = new Map<string, number>();
  for (const f of feedbacks ?? []) {
    for (const oc of f.ocorrencias ?? []) {
      contagemOcorrencias.set(oc, (contagemOcorrencias.get(oc) ?? 0) + 1);
    }
  }
  const rankingOcorrencias = OCORRENCIAS.map((o) => ({
    ...o,
    total: contagemOcorrencias.get(o.id) ?? 0,
  }))
    .filter((o) => o.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Feedbacks das Rotas"
        subtitle="O que os colaboradores relataram"
      />

      <div className="mb-4 flex gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.dias}
            href={`/admin/feedbacks?dias=${p.dias}`}
            className={`flex-1 rounded-xl border py-2 text-center text-sm font-semibold ${
              p.dias === dias
                ? "border-primary bg-primary-soft text-primary"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{totalFeedbacks}</p>
          <p className="text-xs text-slate-500">respostas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{mediaNota}</p>
          <p className="text-xs text-slate-500">nota média (0 a 3)</p>
        </div>
      </div>

      {rankingOcorrencias.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Ocorrências mais relatadas
          </h2>
          <div className="space-y-2">
            {rankingOcorrencias.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <span className="w-52 shrink-0 text-sm text-slate-600">
                  {o.emoji} {o.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${(o.total / rankingOcorrencias[0].total) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">
                  {o.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 font-semibold text-slate-700">Respostas</h2>
      {totalFeedbacks === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum feedback nesse período.
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks!.map((f) => {
            const perfil = nomePorId.get(f.colaborador_id);
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {perfil?.nome ?? "Colaborador"}
                      </p>
                      {f.rota && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                          Mapa {f.rota}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{perfil?.cargo}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{rotuloNota(f.nota)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(f.criado_em).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {f.ocorrencias?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {f.ocorrencias.map((oc: string) => (
                      <span
                        key={oc}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                      >
                        {rotuloOcorrencia(oc)}
                      </span>
                    ))}
                  </div>
                )}

                {f.comentario && (
                  <p className="mt-3 border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
                    {f.comentario}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
