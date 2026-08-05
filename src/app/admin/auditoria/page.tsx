import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";

export default async function AuditoriaPage() {
  await requireOwner();

  const admin = createAdminClient();
  const { data: registros } = await admin
    .from("auditoria")
    .select("id, ator_nome, acao, alvo_nome, detalhes, criado_em")
    .order("criado_em", { ascending: false })
    .limit(200);

  const lista = registros ?? [];

  return (
    <div>
      <PageHeader
        title="📋 Log de Auditoria"
        subtitle="Quem mexeu em acessos, quando e no quê"
      />

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nada registrado ainda. Assim que alguma permissão for alterada,
          aparece aqui.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {lista.map((r) => (
            <li key={r.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-slate-800">
                  <strong className="font-semibold">{r.ator_nome}</strong>{" "}
                  <span className="text-slate-600">{r.acao.toLowerCase()}</span>
                  {r.alvo_nome && (
                    <>
                      {" — "}
                      <strong className="font-semibold">{r.alvo_nome}</strong>
                    </>
                  )}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {new Date(r.criado_em).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {r.detalhes && (
                <p className="mt-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-500">
                  {r.detalhes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Mostrando os 200 registros mais recentes. O log é somente leitura:
        nem o dono consegue apagar uma linha pela tela.
      </p>
    </div>
  );
}
