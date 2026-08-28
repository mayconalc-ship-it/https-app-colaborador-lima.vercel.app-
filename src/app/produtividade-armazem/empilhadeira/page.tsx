import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";

export const dynamic = "force-dynamic";

type OperacaoAberta = {
  empilhadeira_id: string;
  operador_nome: string;
  inicio: string;
};

export default async function EmpilhadeiraIndexPage() {
  await requireAcessoModulo("pa-empilhadeira");

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: maquinas }, { data: abertas }] = await Promise.all([
    supabase
      .from("pa_empilhadeiras")
      .select("id, numero")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("numero"),
    supabase
      .from("pa_empilhadeira_operacoes")
      .select("empilhadeira_id, operador_nome, inicio")
      .eq("revenda_id", revendaId)
      .eq("status", "aberta"),
  ]);

  const abertaPorMaquina = new Map<string, OperacaoAberta>();
  for (const a of (abertas ?? []) as OperacaoAberta[]) {
    abertaPorMaquina.set(a.empilhadeira_id, a);
  }

  return (
    <div>
      <PageHeader
        title="Controle de Empilhadeira"
        subtitle="Escolha a máquina para abrir ou fechar a operação."
        fecharHref="/produtividade-armazem"
      />

      <Link
        href="/produtividade-armazem/empilhadeira/gas"
        className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-primary"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl">
            ⛽
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">Consumo de gás P20</span>
            <span className="block text-xs text-slate-500">
              Horas por botijão, rateado entre quem usou a máquina
            </span>
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">Ver →</span>
      </Link>

      {(!maquinas || maquinas.length === 0) && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Nenhuma empilhadeira cadastrada ainda. Peça ao Admin para cadastrar em
          Configuração.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(maquinas ?? []).map((m) => {
          const aberta = abertaPorMaquina.get(m.id);
          return (
            <li key={m.id}>
              <a
                href={`/produtividade-armazem/empilhadeira/${m.id}`}
                className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm transition-colors hover:border-primary ${
                  aberta ? "border-amber-200" : "border-slate-200"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${
                    aberta ? "bg-amber-100" : "bg-primary-soft"
                  }`}
                >
                  🏗️
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold uppercase tracking-wide text-slate-900">
                    Empilhadeira {m.numero}
                  </p>
                  {aberta ? (
                    <p className="mt-0.5 truncate text-xs font-medium text-amber-700">
                      Em uso por {aberta.operador_nome} desde {formatarDataHora(aberta.inicio)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs font-medium text-green-700">Livre</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    aberta ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"
                  }`}
                >
                  {aberta ? "Aberta" : "Fechada"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
