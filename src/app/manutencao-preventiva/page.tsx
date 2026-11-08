import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { modelosComSituacao } from "@/lib/manutencao-preventiva-server";
import { situacao } from "@/lib/manutencao-preventiva";
import { iniciarPreventiva } from "./actions";

export const dynamic = "force-dynamic";

export default async function ManutencaoPreventivaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  const [lista, { data: abertasBanco }, { data: historicoBanco }] = await Promise.all([
    modelosComSituacao(revendaId),
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, iniciada_em")
      .eq("revenda_id", revendaId)
      .eq("iniciada_por", perfil.id)
      .eq("status", "em_andamento"),
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, finalizada_em, finalizada_por_nome, observacao")
      .eq("revenda_id", revendaId)
      .eq("status", "finalizada")
      .order("finalizada_em", { ascending: false })
      .limit(30),
  ]);

  const abertaPorModelo = new Map((abertasBanco ?? []).map((e) => [e.modelo_id, e]));
  const nomePorModelo = new Map(lista.map((l) => [l.modelo.id, l.modelo]));
  const historico = historicoBanco ?? [];

  const atrasadas = lista.filter((l) => {
    const s = situacao(l.modelo, l.ultima?.em ?? null);
    return s.estado === "atrasada" || s.estado === "nunca";
  });

  return (
    <div>
      <PageHeader
        title="🔩 Manutenção Preventiva"
        subtitle="Checklist por equipamento, na frequência combinada."
        fecharHref="/"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      {atrasadas.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            ⏳ {atrasadas.length === 1 ? "1 preventiva pendente" : `${atrasadas.length} preventivas pendentes`}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {atrasadas.map((l) => l.modelo.nome).join(" · ")}
          </p>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Nenhum checklist de preventiva cadastrado nesta revenda ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {lista.map(({ modelo, ultima }) => {
            const s = situacao(modelo, ultima?.em ?? null);
            const aberta = abertaPorModelo.get(modelo.id);
            const cor =
              s.estado === "em_dia"
                ? "border-slate-200 bg-white"
                : s.estado === "vence_hoje"
                  ? "border-amber-300 bg-amber-50"
                  : "border-red-300 bg-red-50";
            return (
              <li key={modelo.id} className={`rounded-2xl border-2 p-4 shadow-sm ${cor}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900">
                      {modelo.emoji ? `${modelo.emoji} ` : ""}
                      {modelo.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      A cada {modelo.periodicidadeDias} dia{modelo.periodicidadeDias === 1 ? "" : "s"}
                      {ultima ? ` · última por ${ultima.por ?? "—"} em ${formatarDataHora(ultima.em)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${
                      s.estado === "em_dia"
                        ? "bg-green-50 text-green-700"
                        : s.estado === "vence_hoje"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {s.texto}
                  </span>
                </div>

                {aberta ? (
                  <a
                    href={`/manutencao-preventiva/${aberta.id}`}
                    className="mt-3 block w-full rounded-xl bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    ▶️ Continuar preventiva iniciada
                  </a>
                ) : (
                  <form action={iniciarPreventiva} className="mt-3">
                    <input type="hidden" name="modelo_id" value={modelo.id} />
                    <BotaoEnviar
                      textoEnviando="Abrindo..."
                      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Fazer a preventiva
                    </BotaoEnviar>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📋 Histórico ({historico.length})
        </summary>
        <div className="border-t border-slate-100">
          {historico.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nenhuma preventiva registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historico.map((e) => {
                const m = nomePorModelo.get(e.modelo_id);
                return (
                  <li key={e.id}>
                    <a href={`/manutencao-preventiva/${e.id}`} className="block p-3 hover:bg-slate-50">
                      <p className="text-sm font-semibold text-slate-900">
                        {m?.emoji ? `${m.emoji} ` : ""}
                        {m?.nome ?? "Checklist removido"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {e.finalizada_em ? formatarDataHora(e.finalizada_em) : "—"} · {e.finalizada_por_nome ?? "—"}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
