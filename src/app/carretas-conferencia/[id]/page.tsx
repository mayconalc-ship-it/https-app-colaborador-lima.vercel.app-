import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  ROTULO_STATUS,
  ROTULO_UNIDADE_ITEM,
  calcularEsperaPortariaMinutos,
  calcularTempoCargaMinutos,
  calcularTempoPatioMinutos,
  calcularTmaMinutos,
  formatarMinutos,
  type AtendimentoCarreta,
  type UnidadeItem,
} from "@/lib/carretas";
import { FormAssumir } from "./FormAssumir";
import { FormConcluirDescarga } from "./FormConcluirDescarga";
import { concluirCarga } from "./actions";

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
  conferente_nome: string | null;
  fim_descarga_em: string | null;
  tem_carga: boolean | null;
  inicio_carga_em: string | null;
  fim_carga_em: string | null;
  finalizacao_em: string | null;
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

type LinhaNota = { tipo: "produto" | "remessa"; numero: string; serie: string };

type LinhaItem = {
  id: string;
  quantidade: number;
  unidade: UnidadeItem;
  lote: string;
  validade: string;
  empilhador: string;
  pa_produtos: { codigo: string; descricao: string } | { codigo: string; descricao: string }[] | null;
};

function nomeRelacionado(v: { nome: string } | { nome: string }[] | null) {
  if (!v) return "—";
  return Array.isArray(v) ? (v[0]?.nome ?? "—") : v.nome;
}

function produtoRelacionado(v: LinhaItem["pa_produtos"]) {
  const p = Array.isArray(v) ? v[0] : v;
  return p ? `${p.codigo} — ${p.descricao}` : "—";
}

export default async function DetalheAtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAcessoModulo("carretas-conferencia");
  const { id } = await params;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: atendimentoBanco }, { data: notasBanco }, { data: itensBanco }] = await Promise.all([
    supabase
      .from("atendimentos_carretas")
      .select(
        "id, numero_dt, motorista_nome, agendamento_em, carga_agendada, placa_cavalo, placa_carreta, chegada_em, portaria_nome, status, inicio_atendimento_em, conferente_nome, fim_descarga_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em, pa_fabricas(nome), pa_transportadoras(nome)",
      )
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    supabase.from("atendimento_carretas_notas").select("tipo, numero, serie").eq("atendimento_id", id),
    supabase
      .from("atendimento_carretas_itens")
      .select("id, quantidade, unidade, lote, validade, empilhador, pa_produtos(codigo, descricao)")
      .eq("atendimento_id", id),
  ]);

  const a = atendimentoBanco as unknown as LinhaAtendimento | null;
  if (!a) notFound();

  const notas = (notasBanco ?? []) as LinhaNota[];
  const itens = (itensBanco ?? []) as unknown as LinhaItem[];
  const notasProduto = notas.filter((n) => n.tipo === "produto");
  const notasRemessa = notas.filter((n) => n.tipo === "remessa");

  const atendimentoCalc = {
    chegadaEm: a.chegada_em,
    agendamentoEm: a.agendamento_em,
    cargaAgendada: a.carga_agendada,
    inicioAtendimentoEm: a.inicio_atendimento_em,
    fimDescargaEm: a.fim_descarga_em,
    inicioCargaEm: a.inicio_carga_em,
    fimCargaEm: a.fim_carga_em,
    finalizacaoEm: a.finalizacao_em,
  } as AtendimentoCarreta;

  const tma = calcularTmaMinutos(atendimentoCalc);
  const esperaPortaria = calcularEsperaPortariaMinutos(atendimentoCalc);
  const tempoCarga = calcularTempoCargaMinutos(atendimentoCalc);
  const tempoPatio = calcularTempoPatioMinutos(atendimentoCalc);

  return (
    <div>
      <PageHeader title={`Carreta ${a.placa_carreta}`} subtitle={`DT ${a.numero_dt} — ${ROTULO_STATUS[a.status]}`} />

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
                <th className="p-2 text-right">Qtd.</th>
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
                  <td className="p-2">{i.lote}</td>
                  <td className="p-2">{i.validade}</td>
                  <td className="p-2">{i.empilhador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {a.status === "aguardando_conferente" && <FormAssumir atendimentoId={a.id} />}

      {a.status === "em_descarga" && <FormConcluirDescarga atendimentoId={a.id} />}

      {a.status === "em_carga" && (
        <form action={concluirCarga}>
          <input type="hidden" name="atendimento_id" value={a.id} />
          <BotaoEnviar
            textoEnviando="Concluindo..."
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Concluir carga e finalizar
          </BotaoEnviar>
        </form>
      )}

      {a.status === "finalizado" && (
        <div className="space-y-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="text-base font-bold text-green-800">
            TMA: {tma !== null ? formatarMinutos(tma) : "—"}
          </p>
          <p className="text-slate-600">Espera na portaria: {esperaPortaria !== null ? formatarMinutos(esperaPortaria) : "—"}</p>
          {a.tem_carga && <p className="text-slate-600">Tempo de carga: {tempoCarga !== null ? formatarMinutos(tempoCarga) : "—"}</p>}
          <p className="text-slate-600">Tempo total no pátio: {tempoPatio !== null ? formatarMinutos(tempoPatio) : "—"}</p>
          <p className="text-xs text-slate-400">Finalizado em {a.finalizacao_em ? formatarDataHora(a.finalizacao_em) : "—"}</p>
        </div>
      )}
    </div>
  );
}
