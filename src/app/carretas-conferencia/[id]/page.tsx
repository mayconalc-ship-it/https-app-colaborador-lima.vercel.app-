import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora, formatarHora, LIMITE_AVARIA_ALERTA } from "@/lib/produtividade-armazem";
import {
  RECEBIMENTO_CONFIG_PADRAO,
  ROTULO_STATUS,
  ROTULO_UNIDADE_AG,
  ROTULO_UNIDADE_ITEM,
  calcularEsperaPortariaMinutos,
  calcularTempoCargaMinutos,
  calcularTempoConferenciaMinutos,
  calcularTempoDescargaMinutos,
  calcularTempoPatioMinutos,
  calcularTmaMinutos,
  formatarMinutos,
  pctAvariaAtendimento,
  type AtendimentoCarreta,
  type UnidadeAg,
  type UnidadeItem,
} from "@/lib/carretas";
import { FormFinalizarConferencia } from "./FormFinalizarConferencia";
import { FormDecidirRetorno } from "./FormDecidirRetorno";
import { concluirCarga, finalizarDescarga, iniciarConferencia, iniciarDescarga } from "./actions";

export const dynamic = "force-dynamic";

type LinhaAtendimento = {
  id: string;
  numero_dt: string;
  motorista_nome: string;
  agendamento_em: string | null;
  carga_agendada: boolean;
  placa_cavalo: string;
  placa_carreta: string;
  chegada_em: string;
  portaria_nome: string;
  status: AtendimentoCarreta["status"];
  inicio_atendimento_em: string | null;
  inicio_descarga_em: string | null;
  inicio_conferencia_em: string | null;
  fim_conferencia_em: string | null;
  retorno_decidido_em: string | null;
  conferente_nome: string | null;
  fim_descarga_em: string | null;
  tem_carga: boolean | null;
  inicio_carga_em: string | null;
  fim_carga_em: string | null;
  finalizacao_em: string | null;
  destino_retorno: string | null;
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

type LinhaNota = { tipo: "produto" | "remessa"; numero: string; serie: string };

type LinhaItem = {
  id: string;
  quantidade: number;
  quantidade_avariada: number | null;
  unidade: UnidadeItem;
  lote: string;
  validade: string;
  empilhador: string;
  pa_produtos: { codigo: string; descricao: string } | { codigo: string; descricao: string }[] | null;
};

type LinhaAgItem = {
  id: string;
  quantidade: number;
  pa_ag_catalogo: { codigo: string; descricao: string; unidade: string } | { codigo: string; descricao: string; unidade: string }[] | null;
};

function nomeRelacionado(v: { nome: string } | { nome: string }[] | null) {
  if (!v) return "—";
  return Array.isArray(v) ? (v[0]?.nome ?? "—") : v.nome;
}

function produtoRelacionado(v: LinhaItem["pa_produtos"]) {
  const p = Array.isArray(v) ? v[0] : v;
  return p ? `${p.codigo} — ${p.descricao}` : "—";
}

function agRelacionado(v: LinhaAgItem["pa_ag_catalogo"]) {
  const a = Array.isArray(v) ? v[0] : v;
  return a ? { rotulo: `${a.codigo} — ${a.descricao}`, unidade: a.unidade as UnidadeAg } : null;
}

export default async function DetalheAtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAcessoModulo("carretas-conferencia");
  const { id } = await params;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: atendimentoBanco }, { data: notasBanco }, { data: itensBanco }, { data: agItensBanco }, { data: agCatalogoBanco }, { data: configBanco }, { data: fabricasBanco }] =
    await Promise.all([
      supabase
        .from("atendimentos_carretas")
        .select(
          "id, numero_dt, motorista_nome, agendamento_em, carga_agendada, placa_cavalo, placa_carreta, chegada_em, portaria_nome, status, inicio_atendimento_em, inicio_descarga_em, inicio_conferencia_em, fim_conferencia_em, retorno_decidido_em, conferente_nome, fim_descarga_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em, destino_retorno, pa_fabricas(nome), pa_transportadoras(nome)",
        )
        .eq("id", id)
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      supabase.from("atendimento_carretas_notas").select("tipo, numero, serie").eq("atendimento_id", id),
      supabase
        .from("atendimento_carretas_itens")
        .select("id, quantidade, quantidade_avariada, unidade, lote, validade, empilhador, pa_produtos(codigo, descricao)")
        .eq("atendimento_id", id),
      supabase
        .from("atendimento_carretas_ag_itens")
        .select("id, quantidade, pa_ag_catalogo(codigo, descricao, unidade)")
        .eq("atendimento_id", id),
      supabase
        .from("pa_ag_catalogo")
        .select("id, codigo, descricao, unidade")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .order("codigo"),
      supabase
        .from("pa_recebimento_config")
        .select("tma_alvo_minutos, dias_minimos_validade_alerta")
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      supabase.from("pa_fabricas").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
    ]);

  const a = atendimentoBanco as unknown as LinhaAtendimento | null;
  if (!a) notFound();

  const notas = (notasBanco ?? []) as LinhaNota[];
  const itens = (itensBanco ?? []) as unknown as LinhaItem[];
  const agItens = (agItensBanco ?? []) as unknown as LinhaAgItem[];
  const agCatalogo = (agCatalogoBanco ?? []) as { id: string; codigo: string; descricao: string; unidade: string }[];
  const diasMinimosValidadeAlerta = configBanco?.dias_minimos_validade_alerta ?? RECEBIMENTO_CONFIG_PADRAO.diasMinimosValidadeAlerta;
  const fabricas = (fabricasBanco ?? []) as { id: string; nome: string }[];
  const notasProduto = notas.filter((n) => n.tipo === "produto");
  const notasRemessa = notas.filter((n) => n.tipo === "remessa");

  const atendimentoCalc = {
    chegadaEm: a.chegada_em,
    agendamentoEm: a.agendamento_em,
    cargaAgendada: a.carga_agendada,
    inicioAtendimentoEm: a.inicio_atendimento_em,
    inicioDescargaEm: a.inicio_descarga_em,
    inicioConferenciaEm: a.inicio_conferencia_em,
    fimConferenciaEm: a.fim_conferencia_em,
    retornoDecidoEm: a.retorno_decidido_em,
    fimDescargaEm: a.fim_descarga_em,
    inicioCargaEm: a.inicio_carga_em,
    fimCargaEm: a.fim_carga_em,
    finalizacaoEm: a.finalizacao_em,
  } as AtendimentoCarreta;

  const tma = calcularTmaMinutos(atendimentoCalc);
  const esperaPortaria = calcularEsperaPortariaMinutos(atendimentoCalc);
  const tempoDescarga = calcularTempoDescargaMinutos(atendimentoCalc);
  const tempoConferencia = calcularTempoConferenciaMinutos(atendimentoCalc);
  const tempoCarga = calcularTempoCargaMinutos(atendimentoCalc);
  const tempoPatio = calcularTempoPatioMinutos(atendimentoCalc);
  const pctAvaria = pctAvariaAtendimento(itens.map((i) => ({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada })));

  const nomesEmpilhadores = [...new Set(itens.map((i) => i.empilhador).filter(Boolean))];

  const emAndamento = a.status === "aguardando_conferente" || a.status === "em_andamento";

  return (
    <div>
      <PageHeader
        title={`🚛 Carreta ${a.placa_carreta}`}
        subtitle={`DT ${a.numero_dt} — ${ROTULO_STATUS[a.status]}`}
        fecharHref="/carretas-conferencia"
      />

      <div className="mb-4 space-y-1 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <p><strong>{nomeRelacionado(a.pa_fabricas)}</strong> → {nomeRelacionado(a.pa_transportadoras)}</p>
        <p className="text-slate-600">Motorista: {a.motorista_nome} — Cavalo {a.placa_cavalo}</p>
        <p className="text-slate-600">Chegada: {formatarDataHora(a.chegada_em)} (portaria: {a.portaria_nome})</p>
        {a.carga_agendada && a.agendamento_em && (
          <p className="text-slate-600">Agendado para: {formatarDataHora(a.agendamento_em)}</p>
        )}
        {a.conferente_nome && <p className="text-slate-600">Conferente: {a.conferente_nome}</p>}

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>
            <p className="font-semibold uppercase">NFs Produto</p>
            {notasProduto.length === 0 ? "—" : notasProduto.map((n, i) => <p key={i}>{n.numero}/{n.serie}</p>)}
          </div>
          <div>
            <p className="font-semibold uppercase">NFs Remessa</p>
            {notasRemessa.length === 0 ? "—" : notasRemessa.map((n, i) => <p key={i}>{n.numero}/{n.serie}</p>)}
          </div>
        </div>
      </div>

      {itens.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="p-2">Produto</th>
                <th className="p-2 text-right">Recebido</th>
                <th className="p-2 text-right">Avariado</th>
                <th className="p-2">Lote</th>
                <th className="p-2">Validade</th>
                <th className="p-2">Empilhador</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="p-2">{produtoRelacionado(i.pa_produtos)}</td>
                  <td className="p-2 text-right">{i.quantidade} {ROTULO_UNIDADE_ITEM[i.unidade]}</td>
                  <td className="p-2 text-right">{i.quantidade_avariada ?? "—"}</td>
                  <td className="p-2">{i.lote}</td>
                  <td className="p-2">{i.validade}</td>
                  <td className="p-2">{i.empilhador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {emAndamento && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-bold text-slate-800">📦 Descarga</p>
              {!a.inicio_descarga_em ? (
                <form action={iniciarDescarga}>
                  <input type="hidden" name="atendimento_id" value={a.id} />
                  <BotaoEnviar
                    textoEnviando="Iniciando..."
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
                  >
                    ▶️ Iniciar descarga
                  </BotaoEnviar>
                </form>
              ) : !a.fim_descarga_em ? (
                <>
                  <p className="mb-2 text-xs text-amber-700">🕐 Iniciada às {formatarHora(a.inicio_descarga_em)}</p>
                  <form action={finalizarDescarga}>
                    <input type="hidden" name="atendimento_id" value={a.id} />
                    <BotaoEnviar
                      textoEnviando="Finalizando..."
                      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
                    >
                      ✅ Finalizar descarga
                    </BotaoEnviar>
                  </form>
                </>
              ) : (
                <p className="text-xs font-semibold text-green-700">✅ Descarga concluída às {formatarHora(a.fim_descarga_em)}</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-bold text-slate-800">🔍 Conferência</p>
              {!a.inicio_conferencia_em ? (
                <form action={iniciarConferencia}>
                  <input type="hidden" name="atendimento_id" value={a.id} />
                  <BotaoEnviar
                    textoEnviando="Iniciando..."
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
                  >
                    🔍 Conferir carga
                  </BotaoEnviar>
                </form>
              ) : !a.fim_conferencia_em ? (
                <p className="text-xs text-amber-700">🕐 Em andamento desde {formatarHora(a.inicio_conferencia_em)} -- preencha os itens abaixo.</p>
              ) : (
                <p className="text-xs font-semibold text-green-700">✅ Conferência concluída às {formatarHora(a.fim_conferencia_em)}</p>
              )}
            </div>
          </div>

          {a.inicio_conferencia_em && !a.fim_conferencia_em && (
            <FormFinalizarConferencia atendimentoId={a.id} diasMinimosValidadeAlerta={diasMinimosValidadeAlerta} />
          )}
        </div>
      )}

      {a.status === "aguardando_retorno" && (
        <FormDecidirRetorno atendimentoId={a.id} agCatalogo={agCatalogo} fabricas={fabricas} />
      )}

      {a.status === "em_carga" && (
        <div className="space-y-4">
          {(a.destino_retorno || agItens.length > 0) && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-purple-900">🔄 Retorno com AG</p>
              {a.destino_retorno && <p className="mt-1 text-sm text-purple-800">Destino: {a.destino_retorno}</p>}
              {agItens.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-purple-700">
                  {agItens.map((ai) => {
                    const ag = agRelacionado(ai.pa_ag_catalogo);
                    return (
                      <li key={ai.id}>
                        {ag?.rotulo ?? "—"} — {ai.quantidade} {ag ? ROTULO_UNIDADE_AG[ag.unidade] : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <form action={concluirCarga} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <input type="hidden" name="atendimento_id" value={a.id} />
            <BotaoEnviar
              textoEnviando="Concluindo..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
            >
              ✅ Concluir carga e finalizar
            </BotaoEnviar>
          </form>
        </div>
      )}

      {a.status === "finalizado" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <span className="text-4xl">✅</span>
            <p className="mt-2 text-sm font-bold text-green-800">Atendimento finalizado</p>
            <p className="text-xs text-green-700">
              {a.finalizacao_em ? formatarDataHora(a.finalizacao_em) : "—"}
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-green-700">TMA Total</p>
            <p className="text-4xl font-extrabold text-green-800">{tma !== null ? formatarMinutos(tma) : "—"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { rotulo: "Espera portaria", valor: esperaPortaria !== null ? formatarMinutos(esperaPortaria) : "—" },
              { rotulo: "Tempo de descarga", valor: tempoDescarga !== null ? formatarMinutos(tempoDescarga) : "—" },
              { rotulo: "Tempo de conferência", valor: tempoConferencia !== null ? formatarMinutos(tempoConferencia) : "—" },
              ...(a.tem_carga ? [{ rotulo: "Tempo de carga", valor: tempoCarga !== null ? formatarMinutos(tempoCarga) : "—" }] : []),
              { rotulo: "Tempo no pátio", valor: tempoPatio !== null ? formatarMinutos(tempoPatio) : "—" },
              {
                rotulo: "% Avaria",
                valor: pctAvaria !== null ? `${pctAvaria}%` : "—",
                alerta: pctAvaria !== null && pctAvaria > LIMITE_AVARIA_ALERTA,
              },
            ].map((c) => (
              <div
                key={c.rotulo}
                className={`rounded-2xl border p-3 text-center shadow-sm ${
                  "alerta" in c && c.alerta ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-400">{c.rotulo}</p>
                <p className={`mt-1 text-sm font-bold ${"alerta" in c && c.alerta ? "text-red-700" : "text-slate-800"}`}>
                  {c.valor}
                </p>
              </div>
            ))}
          </div>
          <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">ℹ️ Como cada indicador é medido</summary>
            <ul className="mt-2 space-y-1.5">
              <li><strong>TMA Total</strong> — o principal: da chegada (ou do horário agendado, se era agendada) até o conferente decidir se a carreta volta vazia ou com AG. Inclui espera, descarga e conferência -- tudo o que acontece antes dessa decisão.</li>
              <li><strong>Espera na portaria</strong> — da chegada até alguém começar a trabalhar (descarga ou conferência, o que vier primeiro). É um recorte DE DENTRO do TMA, não soma com ele.</li>
              <li><strong>Tempo de descarga</strong> — só a fase de tirar as caixas do caminhão, do empilhador iniciar até finalizar.</li>
              <li><strong>Tempo de conferência</strong> — só a fase de contar/registrar o que chegou, do conferente iniciar até finalizar. Pode acontecer ao mesmo tempo que a descarga, por isso os dois não somam pro TMA.</li>
              <li><strong>Tempo de carga</strong> — só o carregamento de AG no retorno, começa depois da decisão de retorno.</li>
              <li><strong>Tempo no pátio</strong> — o relógio inteiro, da chegada até a saída (inclui carregar AG, se houver). É o único cronometrado direto do início ao fim.</li>
              <li><strong>% Avaria</strong> — soma de tudo que veio avariado dividido pela soma de tudo que foi recebido, olhando todos os itens da conferência.</li>
            </ul>
          </details>

          {(a.destino_retorno || agItens.length > 0) && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-purple-900">🔄 Retorno com AG</p>
              {a.destino_retorno && <p className="mt-1 text-sm text-purple-800">Destino: {a.destino_retorno}</p>}
              {agItens.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-purple-700">
                  {agItens.map((ai) => {
                    const ag = agRelacionado(ai.pa_ag_catalogo);
                    return (
                      <li key={ai.id}>
                        {ag?.rotulo ?? "—"} — {ai.quantidade} {ag ? ROTULO_UNIDADE_AG[ag.unidade] : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {nomesEmpilhadores.length > 0 && (
            <p className="text-xs text-slate-500">Empilhador(es): {nomesEmpilhadores.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
