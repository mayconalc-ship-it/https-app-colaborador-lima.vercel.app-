import { createAdminClient } from "@/lib/supabase/admin";
import { rotuloCategoria } from "@/lib/cinco-porques-problemas";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { salvarTratativa } from "./actions";

type Analise = {
  id: number;
  colaborador_id: string;
  problema_label: string;
  causa_raiz: string | null;
  categoria: string | null;
  acao_sugerida: string | null;
  tratativa_status: string;
  resposta_lideranca: string | null;
  iniciada_em: string;
};

export async function CincoPorquesTab({
  revendaId,
  desde,
}: {
  revendaId: string;
  desde: Date;
}) {
  const admin = createAdminClient();

  // Só análises que o motorista já concluiu entram na fila de tratativa --
  // uma "em_andamento" pode ser só um motorista que ainda não terminou.
  const { data: analises } = await admin
    .from("cinco_porques_analises")
    .select(
      "id, colaborador_id, problema_label, causa_raiz, categoria, acao_sugerida, tratativa_status, resposta_lideranca, iniciada_em",
    )
    .eq("revenda_id", revendaId)
    .eq("status", "concluida")
    .gte("iniciada_em", desde.toISOString())
    .order("iniciada_em", { ascending: false });

  const lista = (analises ?? []) as Analise[];

  const ids = Array.from(new Set(lista.map((a) => a.colaborador_id)));
  const { data: perfis } = ids.length
    ? await admin.from("profiles").select("id, nome, cargo").in("id", ids)
    : { data: [] };
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p]));

  if (lista.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Nenhuma análise de 5 Porquês nesse período.
      </div>
    );
  }

  const pendentes = lista.filter((a) => a.tratativa_status === "pendente").length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{lista.length}</p>
          <p className="text-xs text-slate-500">análises</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary">{pendentes}</p>
          <p className="text-xs text-slate-500">aguardando tratativa</p>
        </div>
      </div>

      <div className="space-y-3">
        {lista.map((a) => {
          const perfil = nomePorId.get(a.colaborador_id);
          return (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {perfil?.nome ?? "Colaborador"}
                  </p>
                  <p className="text-xs text-slate-400">{a.problema_label}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    a.tratativa_status === "concluida"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {a.tratativa_status === "concluida" ? "Tratado" : "Pendente"}
                </span>
              </div>

              <div className="mt-3 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
                <p>
                  <span className="font-semibold text-slate-700">Causa raiz:</span>{" "}
                  <span className="text-slate-600">{a.causa_raiz}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Categoria:</span>{" "}
                  <span className="text-slate-600">{rotuloCategoria(a.categoria ?? "")}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Ação sugerida:</span>{" "}
                  <span className="text-slate-600">{a.acao_sugerida}</span>
                </p>
              </div>

              <form action={salvarTratativa} className="mt-3 space-y-2">
                <input type="hidden" name="analise_id" value={a.id} />
                <textarea
                  name="resposta_lideranca"
                  rows={2}
                  defaultValue={a.resposta_lideranca ?? ""}
                  placeholder="Responda ao motorista o que foi feito..."
                  className="w-full rounded-xl border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                />
                <div className="flex gap-2">
                  <select
                    name="tratativa_status"
                    defaultValue={a.tratativa_status}
                    className="rounded-xl border border-slate-200 p-2 text-sm"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="concluida">Concluída</option>
                  </select>
                  <BotaoEnviar className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark">
                    Salvar
                  </BotaoEnviar>
                </div>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
