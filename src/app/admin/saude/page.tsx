import { PageHeader } from "@/components/PageHeader";
import { requireOwner } from "@/lib/require-admin";
import catalogo from "@/lib/saude-catalogo.json";
import { conferirSaude, type Saude } from "@/lib/saude-sistema-server";
import { LIMITES_DO_PLANO, nivelDoEspaco, type Catalogo } from "@/lib/saude-sistema";

export const dynamic = "force-dynamic";
// Uma consulta por tabela (~170), em lotes: alguns segundos.
export const maxDuration = 60;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const mb = (bytes: number) => `${(bytes / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: bytes < 1e7 ? 1 : 0 })} MB`;

const COR_DO_NIVEL = {
  ok: { caixa: "border-emerald-300 bg-emerald-50", titulo: "text-emerald-800", barra: "bg-emerald-500" },
  atencao: { caixa: "border-amber-300 bg-amber-50", titulo: "text-amber-900", barra: "bg-amber-500" },
  critico: { caixa: "border-red-300 bg-red-50", titulo: "text-red-800", barra: "bg-red-500" },
};

function Barra({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number }) {
  const nivel = nivelDoEspaco(usado, limite);
  const pct = Math.min(100, (usado / limite) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800">{rotulo}</span>
        <span className="tabular-nums text-slate-700">
          <strong>{mb(usado)}</strong> de {mb(limite)} · {pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${COR_DO_NIVEL[nivel].barra}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * O ESPAÇO NO SUPABASE (25/10/2026). Passou do limite do plano, o projeto
 * é bloqueado inteiro -- foi o que quase aconteceu com o Storage, depois
 * de o tráfego já ter bloqueado. O tráfego não sai do banco: só no painel.
 */
function Espaco({ espaco }: { espaco: Saude["espaco"] }) {
  if (!espaco.ok) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-bold text-amber-900">💾 Espaço no Supabase</h2>
        <p className="mt-0.5 text-xs text-amber-800">
          {espaco.faltaMigration ? (
            <>
              Rode a migration 172 (<code className="font-mono">supabase/migrations/172_saude_espaco.sql</code>) para ver o espaço aqui.
            </>
          ) : (
            `Não deu para ler o espaço: ${espaco.erro}`
          )}
        </p>
      </section>
    );
  }

  const storage = espaco.buckets.reduce((s, b) => s + b.bytes, 0);
  const niveis = [nivelDoEspaco(storage, LIMITES_DO_PLANO.storage), nivelDoEspaco(espaco.bancoBytes, LIMITES_DO_PLANO.banco)];
  const nivel = niveis.includes("critico") ? "critico" : niveis.includes("atencao") ? "atencao" : "ok";
  const cor = COR_DO_NIVEL[nivel];

  return (
    <section className={`rounded-2xl border-2 p-4 ${cor.caixa}`} aria-label="Espaço no Supabase">
      <p className={`text-base font-bold ${cor.titulo}`}>
        {nivel === "critico" ? "🔴 Espaço quase no limite" : nivel === "atencao" ? "🟡 Espaço acima de 70%" : "🟢 Espaço com folga"}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">
        {nivel === "ok"
          ? "Plano gratuito do Supabase."
          : "Ao passar do limite, o Supabase bloqueia o app inteiro. Apague fotos antigas de comprovante ou passe para o plano Pro."}
      </p>
      <div className="mt-3 space-y-3">
        <Barra rotulo="Arquivos e fotos (Storage)" usado={storage} limite={LIMITES_DO_PLANO.storage} />
        <Barra rotulo="Banco de dados" usado={espaco.bancoBytes} limite={LIMITES_DO_PLANO.banco} />
      </div>
      <ul className="mt-3 space-y-0.5 text-xs text-slate-700">
        {espaco.buckets.map((b) => (
          <li key={b.bucket} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">
              <code className="font-mono">{b.bucket}</code>
              {b.para && <span className="text-slate-500"> — {b.para}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              {mb(b.bytes)} · {b.arquivos.toLocaleString("pt-BR")} arquivos
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        O tráfego do mês (5 GB no plano gratuito) não aparece aqui: só no painel do Supabase, em Usage.
      </p>
    </section>
  );
}

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

      <Espaco espaco={s.espaco} />

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
