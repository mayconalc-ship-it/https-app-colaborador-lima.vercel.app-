import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { iniciarExecucao5s } from "./actions";

export const dynamic = "force-dynamic";

export default async function CincoSPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("pa-cinco-s");

  const sp = await searchParams;
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: aberta }, { data: recentes }] = await Promise.all([
    supabase
      .from("pa_execucoes_5s")
      .select("id, inicio")
      .eq("revenda_id", revendaId)
      .eq("responsavel_id", perfil.id)
      .is("fim", null)
      .maybeSingle(),
    supabase
      .from("pa_execucoes_5s")
      .select("id, responsavel_nome, inicio, fim, observacoes")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .order("fim", { ascending: false })
      .limit(15),
  ]);

  return (
    <div>
      <PageHeader title="5S do Armazém" subtitle="Registre o início, o checklist e o fim da execução." />

      <a href="/produtividade-armazem" className="mb-4 inline-flex text-sm font-medium text-primary hover:underline">
        ← Produtividade do Armazém
      </a>

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      {aberta ? (
        <a
          href={`/produtividade-armazem/cinco-s/${aberta.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <div>
            <p className="text-sm font-bold text-amber-900">Execução em andamento</p>
            <p className="text-xs text-amber-800">Iniciada às {formatarDataHora(aberta.inicio)}</p>
          </div>
          <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
            Continuar →
          </span>
        </a>
      ) : (
        <form action={iniciarExecucao5s}>
          <BotaoEnviar
            textoEnviando="Iniciando..."
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            🧹 Iniciar execução do 5S
          </BotaoEnviar>
        </form>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Últimas execuções</h2>
        {(!recentes || recentes.length === 0) ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Nenhuma execução registrada ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentes.map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{e.responsavel_nome}</p>
                <p className="text-xs text-slate-500">
                  {formatarDataHora(e.inicio)} – {e.fim ? formatarDataHora(e.fim) : "—"}
                </p>
                {e.observacoes && <p className="mt-1 text-xs text-slate-600">{e.observacoes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
