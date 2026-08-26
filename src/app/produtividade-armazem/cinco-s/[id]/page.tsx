import { redirect, notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { ROTULO_SENSO, SENSOS, formatarDataHora, type Senso } from "@/lib/produtividade-armazem";
import { finalizarExecucao5s } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExecucaoCincoSPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const perfil = await requireAcessoModulo("pa-cinco-s");

  const { id } = await params;
  const sp = await searchParams;
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: execucao }, { data: itensBanco }, { data: marcadosBanco }] = await Promise.all([
    supabase
      .from("pa_execucoes_5s")
      .select("id, responsavel_id, responsavel_nome, inicio, fim, observacoes")
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    supabase
      .from("pa_checklist_5s_itens")
      .select("id, senso, descricao")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem"),
    supabase.from("pa_execucao_5s_itens").select("item_id").eq("execucao_id", id),
  ]);

  if (!execucao) notFound();
  if (execucao.responsavel_id !== perfil.id) {
    redirect(`/produtividade-armazem/cinco-s?erro=${encodeURIComponent("Esta execução não é sua.")}`);
  }

  const itens = (itensBanco ?? []) as { id: string; senso: Senso; descricao: string }[];
  const marcados = new Set((marcadosBanco ?? []).map((m) => m.item_id));
  const finalizada = Boolean(execucao.fim);

  return (
    <div>
      <PageHeader
        title="Checklist 5S"
        subtitle={finalizada ? "Execução encerrada." : `Iniciada às ${formatarDataHora(execucao.inicio)}`}
        fecharHref="/produtividade-armazem/cinco-s"
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}

      <form action={finalizarExecucao5s} className="space-y-6">
        <input type="hidden" name="execucao_id" value={execucao.id} />

        {SENSOS.map((senso) => {
          const doSenso = itens.filter((i) => i.senso === senso);
          if (doSenso.length === 0) return null;
          return (
            <fieldset key={senso} disabled={finalizada} className="rounded-2xl border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-bold text-slate-900">{ROTULO_SENSO[senso]}</legend>
              <div className="mt-2 space-y-2">
                {doSenso.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                  >
                    <input
                      type="checkbox"
                      name="item_id"
                      value={item.id}
                      defaultChecked={marcados.has(item.id)}
                      className="mt-0.5 h-5 w-5 shrink-0"
                    />
                    <span className="text-sm text-slate-700">{item.descricao}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="observacoes">
            Observações
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            disabled={finalizada}
            defaultValue={execucao.observacoes ?? ""}
            rows={3}
            maxLength={500}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none disabled:bg-slate-50"
          />
        </div>

        {!finalizada && (
          <BotaoEnviar
            textoEnviando="Encerrando..."
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Encerrar execução
          </BotaoEnviar>
        )}
      </form>
    </div>
  );
}
