import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora, LIMITE_AVARIA_ALERTA } from "@/lib/produtividade-armazem";
import {
  RECEBIMENTO_CONFIG_PADRAO,
  calcularEsperaPortariaMinutos,
  calcularTempoCargaMinutos,
  calcularTempoConferenciaMinutos,
  calcularTempoDescargaMinutos,
  calcularTempoPatioMinutos,
  calcularTmaMinutos,
  formatarMinutos,
  pctAvariaAtendimento,
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
  inicio_descarga_em: string | null;
  inicio_conferencia_em: string | null;
  fim_conferencia_em: string | null;
  retorno_decidido_em: string | null;
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
      .in("status", ["aguardando_conferente", "em_andamento", "aguardando_retorno", "em_carga"])
      .order("chegada_em", { ascending: true }),
    supabase
      .from("atendimentos_carretas")
      .select(
        "id, numero_dt, motorista_nome, placa_carreta, chegada_em, agendamento_em, carga_agendada, inicio_atendimento_em, inicio_descarga_em, inicio_conferencia_em, fim_conferencia_em, retorno_decidido_em, fim_descarga_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em, portaria_nome, conferente_nome, pa_fabricas(nome), pa_transportadoras(nome)",
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
    ? await supabase
        .from("atendimento_carretas_itens")
        .select("atendimento_id, empilhador, quantidade, quantidade_avariada")
        .in("atendimento_id", idsFinalizados)
    : { data: [] as { atendimento_id: string; empilhador: string; quantidade: number; quantidade_avariada: number | null }[] };
  const empilhadoresPorAtendimento = new Map<string, string[]>();
  const itensPorAtendimento = new Map<string, { quantidade: number; quantidadeAvariada: number | null }[]>();
  for (const i of itensFinalizadosBanco ?? []) {
    const atual = empilhadoresPorAtendimento.get(i.atendimento_id) ?? [];
    if (!atual.includes(i.empilhador)) atual.push(i.empilhador);
    empilhadoresPorAtendimento.set(i.atendimento_id, atual);

    const itensAtual = itensPorAtendimento.get(i.atendimento_id) ?? [];
    itensAtual.push({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada });
    itensPorAtendimento.set(i.atendimento_id, itensAtual);
  }

  // ---- Dash do recebimento: agrega os finalizados de hoje ----
  const metricasFinalizados = finalizados.map((f) => {
    const calc = {
      chegadaEm: f.chegada_em,
      agendamentoEm: f.agendamento_em,
      cargaAgendada: f.carga_agendada,
      inicioAtendimentoEm: f.inicio_atendimento_em,
      inicioDescargaEm: f.inicio_descarga_em,
      inicioConferenciaEm: f.inicio_conferencia_em,
      fimConferenciaEm: f.fim_conferencia_em,
      retornoDecidoEm: f.retorno_decidido_em,
      fimDescargaEm: f.fim_descarga_em,
      inicioCargaEm: f.inicio_carga_em,
      fimCargaEm: f.fim_carga_em,
      finalizacaoEm: f.finalizacao_em,
    } as AtendimentoCarreta;
    return {
      temCarga: f.tem_carga,
      tma: calcularTmaMinutos(calc),
      esperaPortaria: calcularEsperaPortariaMinutos(calc),
      tempoDescarga: calcularTempoDescargaMinutos(calc),
      tempoConferencia: calcularTempoConferenciaMinutos(calc),
      tempoCarga: calcularTempoCargaMinutos(calc),
      pctAvaria: pctAvariaAtendimento(itensPorAtendimento.get(f.id) ?? []),
    };
  });

  function media(valores: (number | null)[]): number | null {
    const validos = valores.filter((v): v is number => v !== null);
    if (validos.length === 0) return null;
    return Math.round(validos.reduce((s, v) => s + v, 0) / validos.length);
  }

  const dash = {
    total: finalizados.length,
    tmaMedio: media(metricasFinalizados.map((m) => m.tma)),
    esperaMedia: media(metricasFinalizados.map((m) => m.esperaPortaria)),
    descargaMedia: media(metricasFinalizados.map((m) => m.tempoDescarga)),
    conferenciaMedia: media(metricasFinalizados.map((m) => m.tempoConferencia)),
    cargaMedia: media(metricasFinalizados.filter((m) => m.temCarga).map((m) => m.tempoCarga)),
    avariaMedia: (() => {
      const validos = metricasFinalizados.map((m) => m.pctAvaria).filter((v): v is number => v !== null);
      if (validos.length === 0) return null;
      return Math.round((validos.reduce((s, v) => s + v, 0) / validos.length) * 10) / 10;
    })(),
    vazios: metricasFinalizados.filter((m) => !m.temCarga).length,
    carregados: metricasFinalizados.filter((m) => m.temCarga).length,
  };

  return (
    <div>
      <PageHeader
        title="🖥️ Monitor de Recebimento"
        subtitle="Monitor ao vivo — atende, preenche e finaliza."
        fecharHref="/produtividade-armazem"
      />

      <a
        href="/carretas-portaria"
        className="mb-4 inline-flex text-sm font-medium text-primary hover:underline"
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
              {finalizados.map((f, i) => {
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
                const m = metricasFinalizados[i];
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
                      {m.tma !== null && (
                        <span className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-green-700">
                          TMA {formatarMinutos(m.tma)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>🚪 Porteiro: {f.portaria_nome}</span>
                      <span>🔎 Conferente: {f.conferente_nome ?? "—"}</span>
                      {empilhadores.length > 0 && <span>🏗️ Empilhador(es): {empilhadores.join(", ")}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>Espera portaria: {m.esperaPortaria !== null ? formatarMinutos(m.esperaPortaria) : "—"}</span>
                      <span>Descarga: {m.tempoDescarga !== null ? formatarMinutos(m.tempoDescarga) : "—"}</span>
                      <span>Conferência: {m.tempoConferencia !== null ? formatarMinutos(m.tempoConferencia) : "—"}</span>
                      {f.tem_carga && <span>Tempo de carga: {m.tempoCarga !== null ? formatarMinutos(m.tempoCarga) : "—"}</span>}
                      <span>Tempo no pátio: {tempoPatio !== null ? formatarMinutos(tempoPatio) : "—"}</span>
                      {m.pctAvaria !== null && <span>Avaria: {m.pctAvaria}%</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📊 Dash do recebimento
        </summary>
        <div className="border-t border-slate-100 p-4">
          {dash.total === 0 ? (
            <p className="text-sm text-slate-400">Sem atendimentos finalizados hoje ainda.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Atendimentos hoje</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{dash.total}</p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">TMA médio</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.tmaMedio !== null ? formatarMinutos(dash.tmaMedio) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Espera na portaria</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.esperaMedia !== null ? formatarMinutos(dash.esperaMedia) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Tempo médio de descarga</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.descargaMedia !== null ? formatarMinutos(dash.descargaMedia) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Tempo médio de conferência</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.conferenciaMedia !== null ? formatarMinutos(dash.conferenciaMedia) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Tempo médio de carga</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.cargaMedia !== null ? formatarMinutos(dash.cargaMedia) : "—"}
                </p>
                <p className="text-[10px] text-slate-400">só entre quem voltou carregada</p>
              </div>
              <div
                className={`rounded-2xl border p-3 text-center shadow-sm ${
                  dash.avariaMedia !== null && dash.avariaMedia > LIMITE_AVARIA_ALERTA
                    ? "border-red-300 bg-red-50"
                    : ""
                }`}
              >
                <p className="text-xs font-semibold uppercase text-slate-500">%Avaria médio</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.avariaMedia !== null ? `${dash.avariaMedia}%` : "—"}
                </p>
              </div>
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Vazias × carregadas</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dash.vazios} × {dash.carregados}
                </p>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
