import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getRevendaAtiva } from "@/lib/revendas";
import { BLOCOS_DA_GESTAO } from "@/lib/gestao";
import { paineisVisiveis } from "@/lib/gestao-server";

export const dynamic = "force-dynamic";

export default async function GestaoPage() {
  const [paineis, revenda] = await Promise.all([paineisVisiveis(), getRevendaAtiva()]);

  const blocos = BLOCOS_DA_GESTAO.map((bloco) => ({
    bloco,
    itens: paineis.filter((p) => p.bloco === bloco),
  })).filter((b) => b.itens.length > 0);

  return (
    <div>
      <PageHeader
        title="📊 Painel de Gestão"
        subtitle={
          revenda
            ? `${revenda.nome} — o que os números dizem`
            : "O que os números dizem"
        }
      />

      {blocos.map(({ bloco, itens }) => (
        <section key={bloco} className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {bloco}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {itens.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary hover:bg-primary-soft/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                  {p.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <span className="truncate">{p.rotulo}</span>
                    {/* Estes dois continuam morando no app do colaborador
                        -- quem opera os usa todo dia. A seta avisa que o
                        clique sai desta área, para a troca de barra não
                        parecer defeito. */}
                    {!p.mora && (
                      <span className="shrink-0 text-xs font-normal text-slate-400" title="Abre no app">
                        ↗
                      </span>
                    )}
                  </span>
                  {/* A pergunta é o que separa um cartão do outro. Seis
                      nomes parecidos obrigariam a abrir para descobrir. */}
                  <span className="mt-0.5 block text-sm text-slate-500">{p.pergunta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
