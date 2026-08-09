import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import {
  fatoresDeLinhas,
  formatarData,
  totalEmCaixas,
  type Contagem,
} from "@/lib/ativo-giro";
import { FormContagem } from "./FormContagem";
import { excluirContagem } from "./actions";

export const dynamic = "force-dynamic";

export default async function AtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const { erro, sucesso } = await searchParams;
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  // Módulo opcional: só quem o Admin liberou (ou gestor/dono) entra aqui.
  if (!(await temAcessoModulo("ativo-giro"))) {
    redirect(
      `/?erro=${encodeURIComponent(
        "Você não tem acesso ao Ativo de Giro. Fale com o Admin.",
      )}`,
    );
  }

  const supabase = await createClient();

  const [{ data: fatoresBanco }, { data: minhas }, gestor] = await Promise.all([
    supabase.from("ag_fatores").select("formato, palete, lastro"),
    supabase
      .from("ag_contagens")
      .select(
        "id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa",
      )
      .eq("colaborador_id", perfil.id)
      .order("data", { ascending: false })
      .order("id", { ascending: false })
      .limit(60),
    podeNoModulo("ativo-giro", "ver"),
  ]);

  const fatores = fatoresDeLinhas(fatoresBanco);
  const contagens = (minhas ?? []) as Contagem[];

  return (
    <div>
      <PageHeader
        title="Ativo de Giro"
        subtitle="Lance a contagem do dia. O controle usa esses números na conciliação."
      />

      {erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          {sucesso}
        </p>
      )}

      <FormContagem fatores={fatores} />

      <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">
        Minhas contagens
      </h2>

      {contagens.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Você ainda não registrou nenhuma contagem.
        </p>
      ) : (
        <ul className="space-y-2">
          {contagens.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {c.tipo} · {c.formato} · {c.status}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatarData(c.data)} — Pal {c.palete} / Las {c.lastro} /
                    Cx {c.caixa}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                    {totalEmCaixas(c, fatores[c.formato])} cx
                  </span>
                  <form action={excluirContagem}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {gestor && (
        <a
          href="/admin/ativo-de-giro"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Abrir conciliação e painel →
        </a>
      )}
    </div>
  );
}
