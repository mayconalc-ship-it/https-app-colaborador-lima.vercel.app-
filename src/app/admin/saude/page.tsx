import { PageHeader } from "@/components/PageHeader";
import { requireOwner } from "@/lib/require-admin";
import catalogo from "@/lib/saude-catalogo.json";
import { conferirSaude } from "@/lib/saude-sistema-server";
import type { Catalogo } from "@/lib/saude-sistema";

export const dynamic = "force-dynamic";
// Uma consulta por tabela (~170), em lotes: alguns segundos.
export const maxDuration = 60;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * SAÚDE DO SISTEMA -- as migrations rodaram? (ver lib/saude-sistema).
 *
 * Responde, de cima para baixo: está tudo instalado? se não, QUAL arquivo
 * rodar, na ordem; os buckets de foto existem? e a varredura de lembretes
 * e anomalias está passando?
 */
export default async function SaudePage() {
  await requireOwner();
  const s = await conferirSaude();
  const arquivos = (catalogo as Catalogo).arquivos;
  const tudoCerto = s.faltas.length === 0 && s.outros.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader title="🩺 Saúde do sistema" subtitle="As migrations do banco estão em dia com o app?" />

      <section
        className={`rounded-2xl border-2 p-4 ${tudoCerto ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}
        aria-label="Situação"
      >
        <p className={`text-base font-bold ${tudoCerto ? "text-emerald-800" : "text-red-800"}`}>
          {tudoCerto ? "🟢 Tudo instalado" : `🔴 Faltam ${s.faltas.length} migration${s.faltas.length === 1 ? "" : "s"}`}
        </p>
        <p className="mt-0.5 text-sm text-slate-700">
          {s.conferidas} tabelas conferidas em {(s.duracaoMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s.
          {!tudoCerto && " Rode os arquivos abaixo no SQL Editor do Supabase, nesta ordem."}
        </p>
      </section>

      {s.faltas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">O que falta rodar</h2>
          <ol className="space-y-2">
            {s.faltas.map((g) => (
              <li key={g.migration} className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-slate-900">
                  Migration {g.migration}
                  <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                    supabase/migrations/{arquivos[g.migration] ?? `${g.migration}_*.sql`}
                  </span>
                </p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700">
                  {g.faltas.map((f) => (
                    <li key={f.tipo === "tabela" ? f.tabela : `${f.tabela}.${f.coluna}`}>
                      {f.tipo === "tabela" ? (
                        <>
                          Falta a tabela <code className="font-mono">{f.tabela}</code>
                        </>
                      ) : (
                        <>
                          Falta a coluna <code className="font-mono">{f.coluna}</code> em <code className="font-mono">{f.tabela}</code>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="px-1 text-[11px] text-slate-500">
            Arquivo grande demais para colar de uma vez? Peça para dividir em partes — cada parte com menos de 100 linhas.
          </p>
        </section>
      )}

      {s.outros.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-900">Não deu para conferir</h2>
          <p className="mt-0.5 text-xs text-amber-800">Erro que não diz “falta” (rede, permissão). Recarregue a tela; se repetir, avise.</p>
          <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
            {s.outros.map((o) => (
              <li key={o.tabela}>
                <code className="font-mono">{o.tabela}</code>: {o.erro}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">🗂️ Buckets de arquivos</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {s.buckets.map((b) => (
              <li key={b.id} className={b.existe ? "text-slate-700" : "font-semibold text-red-700"}>
                {b.existe ? "✅" : "❌"} <code className="font-mono">{b.id}</code> — {b.para}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">⏱️ Varredura de lembretes e anomalias</h2>
          <p className="mt-2 text-xs text-slate-700">
            {s.ultimaVarredura ? (
              <>
                Última passada: <strong>{dataHora(s.ultimaVarredura)}</strong>.
              </>
            ) : (
              "Ainda não registrou nenhuma passada."
            )}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Roda quando alguém abre o app (no máximo a cada 15 min), pelo agendador do GitHub e ao fim de cada atendimento de
            carreta. Parada há horas em pleno expediente é sinal de problema.
          </p>
        </div>
      </section>
    </div>
  );
}
