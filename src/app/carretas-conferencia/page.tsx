import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { calcularTmaMinutos, formatarMinutos, type AtendimentoCarreta } from "@/lib/carretas";
import { MonitorCarretas, type CardAtendimento } from "./MonitorCarretas";

export const dynamic = "force-dynamic";

type LinhaAtiva = {
  id: string;
  numero_dt: string;
  motorista_nome: string;
  placa_carreta: string;
  chegada_em: string;
  status: CardAtendimento["status"];
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

type LinhaFinalizada = {
  id: string;
  numero_dt: string;
  placa_carreta: string;
  chegada_em: string;
  agendamento_em: string | null;
  carga_agendada: boolean;
  fim_descarga_em: string | null;
  finalizacao_em: string | null;
};

function nomeRelacionado(v: { nome: string } | { nome: string }[] | null) {
  if (!v) return "—";
  return Array.isArray(v) ? (v[0]?.nome ?? "—") : v.nome;
}

export default async function CarretasConferenciaPage() {
  await requireAcessoModulo("carretas-conferencia");

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [{ data: ativosBanco }, { data: finalizadosBanco }] = await Promise.all([
    supabase
      .from("atendimentos_carretas")
      .select("id, numero_dt, motorista_nome, placa_carreta, chegada_em, status, pa_fabricas(nome), pa_transportadoras(nome)")
      .eq("revenda_id", revendaId)
      .in("status", ["aguardando_conferente", "em_descarga", "em_carga"])
      .order("chegada_em", { ascending: true }),
    supabase
      .from("atendimentos_carretas")
      .select("id, numero_dt, placa_carreta, chegada_em, agendamento_em, carga_agendada, fim_descarga_em, finalizacao_em")
      .eq("revenda_id", revendaId)
      .eq("status", "finalizado")
      .gte("finalizacao_em", inicioHoje.toISOString())
      .order("finalizacao_em", { ascending: false })
      .limit(20),
  ]);

  const ativos = ((ativosBanco ?? []) as unknown as LinhaAtiva[]).map(
    (a): CardAtendimento => ({
      id: a.id,
      numeroDt: a.numero_dt,
      motoristaNome: a.motorista_nome,
      placaCarreta: a.placa_carreta,
      chegadaEm: a.chegada_em,
      status: a.status,
      fabricaNome: nomeRelacionado(a.pa_fabricas),
      transportadoraNome: nomeRelacionado(a.pa_transportadoras),
    }),
  );

  const finalizados = (finalizadosBanco ?? []) as unknown as LinhaFinalizada[];

  return (
    <div>
      <PageHeader title="Conferência de Carretas" subtitle="Monitor ao vivo — atende, preenche e finaliza." />

      <MonitorCarretas iniciais={ativos} revendaId={revendaId} />

      <details className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          Finalizados hoje ({finalizados.length})
        </summary>
        <div className="border-t border-slate-100">
          {finalizados.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nada finalizado ainda hoje.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {finalizados.map((f) => {
                const tma = calcularTmaMinutos({
                  chegadaEm: f.chegada_em,
                  agendamentoEm: f.agendamento_em,
                  cargaAgendada: f.carga_agendada,
                  fimDescargaEm: f.fim_descarga_em,
                } as AtendimentoCarreta);
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">Carreta {f.placa_carreta} — DT {f.numero_dt}</p>
                      <p className="text-xs text-slate-500">Chegou {formatarDataHora(f.chegada_em)}</p>
                    </div>
                    {tma !== null && (
                      <span className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-green-700">
                        TMA {formatarMinutos(tma)}
                      </span>
                    )}
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
