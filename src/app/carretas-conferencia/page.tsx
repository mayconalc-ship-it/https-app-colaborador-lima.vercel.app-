import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { diasAtrasISO, formatarDataHora, hojeISO, LIMITE_AVARIA_ALERTA } from "@/lib/produtividade-armazem";
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

export default async function CarretasConferenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;

  // Conferente e empilhador viraram módulos separados (ver [id]/actions.ts)
  // -- os dois continuam abrindo o mesmo Monitor pra acompanhar tudo,
  // então basta ter QUALQUER um dos dois pra entrar aqui.
  const [podeConferencia, podeDescarga] = await Promise.all([
    temAcessoModulo("carretas-conferencia"),
    temAcessoModulo("carretas-descarga"),
  ]);
  if (!podeConferencia && !podeDescarga) {
    redirect(`/?erro=${encodeURIComponent("Você não tem acesso a este módulo. Fale com o Admin.")}`);
  }

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  // "Hoje" é o dia no BRASIL, não no fuso do servidor -- a Vercel roda em
  // UTC. Com `new Date().setHours(0,0,0,0)` o dia virava às 21h de
  // Brasília, e tudo que fosse finalizado entre 21h e a meia-noite sumia
  // de "Finalizados hoje" e do Dash: justamente o fim do turno da noite.
  // hojeISO() já devolve a data em America/Sao_Paulo; o Brasil não tem
  // mais horário de verão, então o -03:00 fixo é exato.
  const inicioHoje = new Date(`${hojeISO()}T00:00:00-03:00`);

  // O Dash tem período PRÓPRIO, separado da lista "Finalizados hoje":
  // uma semana por padrão, para enxergar o retroativo e não só o dia --
  // média de um dia só oscila demais para servir de acompanhamento.
  const de = sp.de ?? diasAtrasISO(6);
  const ate = sp.ate ?? hojeISO();
  const inicioPeriodo = new Date(`${de}T00:00:00-03:00`);
  const fimPeriodo = new Date(`${ate}T23:59:59.999-03:00`);
  const filtrouPeriodo = Boolean(sp.de || sp.ate);

  const [
    { data: ativosBanco },
    { data: finalizadosBanco },
    { data: configBanco },
    { data: pendentesBanco },
    { data: periodoBanco },
  ] = await Promise.all([
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
    // Ciclo fechado, conferência por fazer. Some das colunas do monitor
    // (que só mostram atendimento ativo) e ficaria enterrada em
    // "Finalizados" -- foi assim que um atendimento real perdeu o tempo
    // de conferência. Sem corte por data: pendência velha é a que mais
    // precisa aparecer.
    supabase
      .from("atendimentos_carretas")
      .select("id, numero_dt, placa_carreta, chegada_em, status, inicio_conferencia_em, pa_fabricas(nome)")
      .eq("revenda_id", revendaId)
      .in("status", ["em_carga", "finalizado"])
      .is("fim_conferencia_em", null)
      .order("chegada_em", { ascending: true })
      .limit(30),
    // Base do Dash: finalizados no período escolhido.
    supabase
      .from("atendimentos_carretas")
      .select(
        "id, chegada_em, agendamento_em, carga_agendada, inicio_atendimento_em, inicio_descarga_em, inicio_conferencia_em, fim_conferencia_em, retorno_decidido_em, fim_descarga_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em",
      )
      .eq("revenda_id", revendaId)
      .eq("status", "finalizado")
      .gte("finalizacao_em", inicioPeriodo.toISOString())
      .lte("finalizacao_em", fimPeriodo.toISOString())
      .order("finalizacao_em", { ascending: false })
      .limit(500),
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

  const conferenciasPendentes = (pendentesBanco ?? []) as unknown as {
    id: string;
    numero_dt: string;
    placa_carreta: string;
    chegada_em: string;
    status: string;
    inicio_conferencia_em: string | null;
    pa_fabricas: { nome: string } | { nome: string }[] | null;
  }[];

  const finalizados = (finalizadosBanco ?? []) as unknown as LinhaFinalizada[];
  const tmaAlvoMinutos = configBanco?.tma_alvo_minutos ?? RECEBIMENTO_CONFIG_PADRAO.tmaAlvoMinutos;

  const doPeriodo = (periodoBanco ?? []) as unknown as LinhaFinalizada[];

  // Uma consulta de itens só, cobrindo a lista de hoje E o período do
  // Dash -- os dois conjuntos costumam se sobrepor, e buscar duas vezes
  // seria pagar o dobro pelo mesmo dado.
  const idsFinalizados = [...new Set([...finalizados.map((f) => f.id), ...doPeriodo.map((f) => f.id)])];
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

  // ---- Dash do recebimento: agrega os finalizados DO PERÍODO ----
  const metricasFinalizados = doPeriodo.map((f) => {
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
    total: doPeriodo.length,
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

      {/* Fica ANTES do monitor de propósito: é trabalho que já deveria
          ter sido feito, e some das colunas por já estar encerrado. */}
      {conferenciasPendentes.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            ⏳ Conferência pendente ({conferenciasPendentes.length})
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            A carreta já saiu, mas a contagem do que chegou ainda não foi lançada.
          </p>
          <ul className="mt-3 space-y-2">
            {conferenciasPendentes.map((p) => (
              <li key={p.id}>
                <a
                  href={`/carretas-conferencia/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm hover:bg-amber-100"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {nomeRelacionado(p.pa_fabricas)} — Carreta {p.placa_carreta}
                    </span>
                    <span className="block text-xs text-slate-500">
                      DT {p.numero_dt} · Chegou {formatarDataHora(p.chegada_em)} ·{" "}
                      {p.inicio_conferencia_em ? "iniciada, falta finalizar" : "nem iniciada"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-primary">Lançar →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Fica aberto quando veio filtro na URL: o formulário recarrega a
          página, e um <details> que fecha sozinho esconderia o resultado
          que a pessoa acabou de pedir. */}
      <details className="mt-4 rounded-2xl border border-slate-200 bg-white" open={filtrouPeriodo}>
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📊 Dash do recebimento
        </summary>
        <div className="border-t border-slate-100 p-4">
          <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="de">
                De
              </label>
              <input
                id="de"
                type="date"
                name="de"
                defaultValue={de}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none sm:w-auto"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="ate">
                Até
              </label>
              <input
                id="ate"
                type="date"
                name="ate"
                defaultValue={ate}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none sm:w-auto"
              />
            </div>
            <button
              type="submit"
              className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white sm:col-span-1"
            >
              Filtrar
            </button>
          </form>

          {dash.total === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma carreta finalizada neste período.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border p-3 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Atendimentos</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{dash.total}</p>
                <p className="text-[10px] text-slate-400">no período</p>
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

          {/* Recolhida: quem já sabe não tropeça nela, e quem tem dúvida
              não precisa perguntar. Mesma explicação da tela de detalhe
              do atendimento -- uma definição só para os dois lugares. */}
          <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">
              ℹ️ O que significa cada indicador
            </summary>
            <ul className="mt-2 space-y-1.5">
              <li>
                <strong>Período</strong> — todos os números deste painel seguem as datas escolhidas
                acima (uma semana, por padrão). A lista &ldquo;Finalizados hoje&rdquo; é separada e
                mostra só o dia. O dia vira à meia-noite de Brasília.
              </li>
              <li>
                <strong>Atendimentos</strong> — quantas carretas foram finalizadas no período.
              </li>
              <li>
                <strong>TMA médio</strong> — o principal: da chegada (ou do horário agendado, se era
                agendada) até o FIM DA DESCARGA. É o tempo em que a carreta ficou presa ao armazém;
                terminada a descarga o caminhão pode ir embora, e a conferência do que chegou segue
                no chão depois.
              </li>
              <li>
                <strong>Espera na portaria</strong> — da chegada até alguém começar a trabalhar
                (descarga ou conferência, o que vier primeiro). É um recorte DE DENTRO do TMA, não
                soma com ele. Serve para separar fila de gargalo na descarga.
              </li>
              <li>
                <strong>Tempo médio de descarga</strong> — só a fase de tirar as caixas do caminhão,
                do empilhador iniciar até finalizar.
              </li>
              <li>
                <strong>Tempo médio de conferência</strong> — só a contagem e o registro do que
                chegou, do conferente iniciar até finalizar. Pode acontecer ao mesmo tempo que a
                descarga, por isso os dois não somam para o TMA.
              </li>
              <li>
                <strong>Tempo médio de carga</strong> — só o carregamento de AG no retorno, contado
                a partir do fim da descarga. Média apenas entre as carretas que voltaram carregadas.
              </li>
              <li>
                <strong>% Avaria médio</strong> — tudo que chegou avariado dividido por tudo que foi
                recebido, olhando os itens lançados na conferência.
              </li>
              <li>
                <strong>Vazias × carregadas</strong> — quantas voltaram sem nada e quantas voltaram
                com AG.
              </li>
              <li>
                <strong>Tempo no pátio</strong> (aparece no detalhe de cada carreta) — o relógio
                inteiro, da chegada até a saída, incluindo o carregamento de AG quando houver. É o
                único medido direto do início ao fim; por isso costuma ser maior que o TMA.
              </li>
            </ul>
          </details>
        </div>
      </details>
    </div>
  );
}
