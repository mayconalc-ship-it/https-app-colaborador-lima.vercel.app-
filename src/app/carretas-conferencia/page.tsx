import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  RECEBIMENTO_CONFIG_PADRAO,
  calcularEsperaPortariaMinutos,
  calcularTempoCargaMinutos,
  calcularTempoPatioMinutos,
  calcularTmaMinutos,
  formatarMinutos,
  type AtendimentoCarreta,
} from "@/lib/carretas";
import { MonitorCarretas, type CardAtendimento } from "./MonitorCarretas";

export const dynamic = "force-dynamic";

type LinhaAtiva = {
  id: string;
  numero_dt: string;
  motorista_nome: string;
  placa_carreta: string;
  chegada_em: string;
  carga_agendada: boolean;
  agendamento_em: string | null;
  status: CardAtendimento["status"];
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

type LinhaFinalizada = {
  id: string;
  numero_dt: string;
  motorista_nome: string;
  placa_carreta: string;
  chegada_em: string;
  agendamento_em: string | null;
  carga_agendada: boolean;
  inicio_atendimento_em: string | null;
  fim_descarga_em: string | null;
  tem_carga: boolean | null;
  inicio_carga_em: string | null;
  fim_carga_em: string | null;
  finalizacao_em: string | null;
  portaria_nome: string;
  conferente_nome: string | null;
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
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

  const [{ data: ativosBanco }, { data: finalizadosBanco }, { data: configBanco }] = await Promise.all([
    supabase
      .from("atendimentos_carretas")
      .select("id, numero_dt, motorista_nome, placa_carreta, chegada_em, carga_agendada, agendamento_em, status, pa_fabricas(nome), pa_transportadoras(nome)")
      .eq("revenda_id", revendaId)
      .in("status", ["aguardando_conferente", "em_descarga", "em_carga"])
      .order("chegada_em", { ascending: true }),
    supabase
      .from("atendimentos_carretas")
      .select(
        "id, numero_dt, motorista_nome, placa_carreta, chegada_em, agendamento_em, carga_agendada, inicio_atendimento_em, fim_descarga_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em, portaria_nome, conferente_nome, pa_fabricas(nome), pa_transportadoras(nome)",
      )
      .eq("revenda_id", revendaId)
      .eq("status", "finalizado")
      .gte("finalizacao_em", inicioHoje.toISOString())
      .order("finalizacao_em", { ascending: false })
      .limit(20),
    supabase.from("pa_recebimento_config").select("tma_alvo_minutos").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  const ativos = ((ativosBanco ?? []) as unknown as LinhaAtiva[]).map(
    (a): CardAtendimento => ({
      id: a.id,
      numeroDt: a.numero_dt,
      motoristaNome: a.motorista_nome,
      placaCarreta: a.placa_carreta,
      chegadaEm: a.chegada_em,
      cargaAgendada: a.carga_agendada,
      agendamentoEm: a.agendamento_em,
      status: a.status,
      fabricaNome: nomeRelacionado(a.pa_fabricas),
      transportadoraNome: nomeRelacionado(a.pa_transportadoras),
    }),
  );

  const finalizados = (finalizadosBanco ?? []) as unknown as LinhaFinalizada[];
  const tmaAlvoMinutos = configBanco?.tma_alvo_minutos ?? RECEBIMENTO_CONFIG_PADRAO.tmaAlvoMinutos;

  const idsFinalizados = finalizados.map((f) => f.id);
  const { data: itensFinalizadosBanco } = idsFinalizados.length > 0
    ? await supabase.from("atendimento_carretas_itens").select("atendimento_id, empilhador").in("atendimento_id", idsFinalizados)
    : { data: [] as { atendimento_id: string; empilhador: string }[] };
  const empilhadoresPorAtendimento = new Map<string, string[]>();
  for (const i of itensFinalizadosBanco ?? []) {
    const atual = empilhadoresPorAtendimento.get(i.atendimento_id) ?? [];
    if (!atual.includes(i.empilhador)) atual.push(i.empilhador);
    empilhadoresPorAtendimento.set(i.atendimento_id, atual);
  }

  return (
    <div>
      <PageHeader title="🖥️ Monitor de Recebimento" subtitle="Monitor ao vivo — atende, preenche e finaliza." />

      <a
        href="/produtividade-armazem"
        className="mb-2 inline-flex text-sm font-medium text-primary hover:underline"
      >
        ← Produtividade do Armazém
      </a>
      <a
        href="/carretas-portaria"
        className="mb-4 ml-4 inline-flex text-sm font-medium text-primary hover:underline"
      >
        👮 Ir para o Recebimento de Carreta →
      </a>

      <MonitorCarretas iniciais={ativos} revendaId={revendaId} tmaAlvoMinutos={tmaAlvoMinutos} />

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
                const calc = {
                  chegadaEm: f.chegada_em,
                  agendamentoEm: f.agendamento_em,
                  cargaAgendada: f.carga_agendada,
                  inicioAtendimentoEm: f.inicio_atendimento_em,
                  fimDescargaEm: f.fim_descarga_em,
                  inicioCargaEm: f.inicio_carga_em,
                  fimCargaEm: f.fim_carga_em,
                  finalizacaoEm: f.finalizacao_em,
                } as AtendimentoCarreta;
                const tma = calcularTmaMinutos(calc);
                const esperaPortaria = calcularEsperaPortariaMinutos(calc);
                const tempoCarga = calcularTempoCargaMinutos(calc);
                const tempoPatio = calcularTempoPatioMinutos(calc);
                const empilhadores = empilhadoresPorAtendimento.get(f.id) ?? [];
                return (
                  <li key={f.id} className="p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {nomeRelacionado(f.pa_fabricas)} → {nomeRelacionado(f.pa_transportadoras)}
                        </p>
                        <p className="text-xs text-slate-500">
                          DT {f.numero_dt} — Carreta {f.placa_carreta} — {f.motorista_nome}
                        </p>
                        <p className="text-xs text-slate-500">Chegou {formatarDataHora(f.chegada_em)}</p>
                      </div>
                      {tma !== null && (
                        <span className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-green-700">
                          TMA {formatarMinutos(tma)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>🚪 Porteiro: {f.portaria_nome}</span>
                      <span>🔎 Conferente: {f.conferente_nome ?? "—"}</span>
                      {empilhadores.length > 0 && <span>🏗️ Empilhador(es): {empilhadores.join(", ")}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>Espera portaria: {esperaPortaria !== null ? formatarMinutos(esperaPortaria) : "—"}</span>
                      {f.tem_carga && <span>Tempo de carga: {tempoCarga !== null ? formatarMinutos(tempoCarga) : "—"}</span>}
                      <span>Tempo no pátio: {tempoPatio !== null ? formatarMinutos(tempoPatio) : "—"}</span>
                    </div>
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
