import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";

/**
 * O join devolve objeto ou lista, dependendo de como o PostgREST resolve a
 * relação. Normalizar aqui evita espalhar essa dúvida pelo JSX.
 */
function nomeDaRevenda(valor: unknown): string | null {
  const item = Array.isArray(valor) ? valor[0] : valor;
  const nome = (item as { nome?: string } | null)?.nome;
  return nome ?? null;
}

export default async function AuditoriaPage() {
  await requireOwner();

  const admin = createAdminClient();

  // Sem recorte por revenda, de propósito: o log é do dono, e ele responde
  // pelo app inteiro. Cortar por revenda esconderia dele justamente as
  // mudanças de acesso que ele precisa conseguir auditar de uma vez só.
  const { data: registros } = await admin
    .from("auditoria")
    .select("id, ator_nome, acao, alvo_nome, detalhes, criado_em, revendas(nome)")
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
                  {nomeDaRevenda(r.revendas) && (
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                      {nomeDaRevenda(r.revendas)}
                    </span>
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
