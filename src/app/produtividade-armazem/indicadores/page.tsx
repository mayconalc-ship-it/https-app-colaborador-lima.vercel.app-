import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  TURNOS,
  agruparPorEmbalagem,
  construirRanking,
  diasAtrasISO,
  embalagemDeLinha,
  hojeISO,
  horasDeOperacao,
  operacaoEmpilhadeiraDeLinha,
  pctAvariaConsolidado,
  type Embalagem,
  type Turno,
} from "@/lib/produtividade-armazem";
import { BarraRanking, CartaoHero, type ItemBarra } from "./Graficos";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; turno?: string }>;
}) {
  await requireAcessoModulo("produtividade-armazem");

  const sp = await searchParams;
  const de = sp.de ?? diasAtrasISO(7);
  const ate = sp.ate ?? hojeISO();
  const turnoFiltro = (TURNOS as readonly string[]).includes(sp.turno ?? "")
    ? (sp.turno as Turno)
    : null;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const de0 = `${de}T00:00:00`;
  const ate23 = `${ate}T23:59:59`;

  const [
    { data: embalagensBanco },
    { data: reepacksBanco },
    { data: despejosBanco },
    { data: pickingsBanco },
    { data: operacoesBanco },
    { data: recebimentosBanco },
  ] = await Promise.all([
    supabase
      .from("pa_embalagens")
      .select(
        "id, nome, tempo_padrao_reepack_segundos, tempo_padrao_despejo_segundos, meta_reepacks_hora, meta_litros_hora, unidade_reepack, litros_por_pacote",
      )
      .eq("revenda_id", revendaId),
    supabase
      .from("pa_reepack_lancamentos")
      .select("embalagem_id, colaborador_id, colaborador_nome, turno, quantidade, inicio, fim")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    supabase
      .from("pa_despejo_lancamentos")
      .select("embalagem_id, colaborador_id, colaborador_nome, turno, litros, inicio, fim")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    supabase
      .from("pa_reabastecimentos_picking")
      .select("colaborador_id, colaborador_nome, turno, posicoes_reabastecidas")
      .eq("revenda_id", revendaId)
      .gte("inicio", de0)
      .lte("inicio", ate23)
      .not("fim", "is", null),
    supabase
      .from("pa_empilhadeira_operacoes")
      .select(
        "id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, foto_inicial_url, inicio, horimetro_final, foto_final_url, fim, encerrado_por_nome, status, pa_empilhadeiras!inner(numero)",
      )
      .eq("revenda_id", revendaId)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    supabase
      .from("pa_recebimentos")
      .select(
        "id, pa_transportadoras(nome), pa_recebimento_itens(quantidade_recebida, quantidade_avariada, pct_avaria)",
      )
      .eq("revenda_id", revendaId)
      .gte("data_recebimento", de)
      .lte("data_recebimento", ate),
  ]);

  const embalagens: Embalagem[] = (embalagensBanco ?? []).map(embalagemDeLinha);

  const reepacksTodos = (reepacksBanco ?? []) as {
    embalagem_id: string;
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    quantidade: number;
    inicio: string;
    fim: string;
  }[];
  const despejosTodos = (despejosBanco ?? []) as {
    embalagem_id: string;
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    litros: number;
    inicio: string;
    fim: string;
  }[];
  const pickingsTodos = (pickingsBanco ?? []) as {
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    posicoes_reabastecidas: number | null;
  }[];

  const reepacks = turnoFiltro ? reepacksTodos.filter((r) => r.turno === turnoFiltro) : reepacksTodos;
  const despejos = turnoFiltro ? despejosTodos.filter((d) => d.turno === turnoFiltro) : despejosTodos;
  const pickings = turnoFiltro ? pickingsTodos.filter((p) => p.turno === turnoFiltro) : pickingsTodos;

  const reepackPorEmbalagem = agruparPorEmbalagem(
    reepacks.map((r) => ({ embalagemId: r.embalagem_id, quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
    embalagens,
    (e) => e.metaReepacksHora,
  );
  const despejoPorEmbalagem = agruparPorEmbalagem(
    despejos.map((d) => ({ embalagemId: d.embalagem_id, quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
    embalagens,
    (e) => e.metaLitrosHora,
  );

  // ---- Reepack e despejo por colaborador ----
  const embalagemPorId = new Map(embalagens.map((e) => [e.id, e]));

  const reepackPorColaborador = new Map<string, { nome: string; quantidade: number; horas: number }>();
  for (const r of reepacks) {
    const atual = reepackPorColaborador.get(r.colaborador_id) ?? { nome: r.colaborador_nome, quantidade: 0, horas: 0 };
    atual.quantidade += r.quantidade;
    atual.horas += (new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 3_600_000;
    reepackPorColaborador.set(r.colaborador_id, atual);
  }
  const barrasReepackColaborador: ItemBarra[] = [...reepackPorColaborador.entries()]
    .map(([, v]) => ({
      rotulo: v.nome,
      valor: v.quantidade,
      detalhe: `${v.nome}: ${v.quantidade} un em ${Math.round(v.horas * 10) / 10}h`,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const despejoPorColaborador = new Map<string, { nome: string; litros: number }>();
  for (const d of despejos) {
    const atual = despejoPorColaborador.get(d.colaborador_id) ?? { nome: d.colaborador_nome, litros: 0 };
    atual.litros += d.litros;
    despejoPorColaborador.set(d.colaborador_id, atual);
  }
  const barrasDespejoColaborador: ItemBarra[] = [...despejoPorColaborador.entries()]
    .map(([, v]) => ({ rotulo: v.nome, valor: Math.round(v.litros * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // ---- Atividade por turno ----
  const barrasPorTurno: ItemBarra[] = TURNOS.map((t) => ({
    rotulo: ROTULO_TURNO[t],
    valor:
      reepacksTodos.filter((r) => r.turno === t).length +
      despejosTodos.filter((d) => d.turno === t).length +
      pickingsTodos.filter((p) => p.turno === t).length,
    detalhe: `${ROTULO_TURNO[t]}: ${reepacksTodos.filter((r) => r.turno === t).length} reepack, ${despejosTodos.filter((d) => d.turno === t).length} despejo, ${pickingsTodos.filter((p) => p.turno === t).length} picking`,
  }));

  // ---- Empilhadeira: por máquina e por operador ----
  const operacoesRaw = (operacoesBanco ?? []) as unknown as (Parameters<typeof operacaoEmpilhadeiraDeLinha>[0] & {
    pa_empilhadeiras: { numero: string } | { numero: string }[] | null;
  })[];
  const operacoes = operacoesRaw.map((o) => operacaoEmpilhadeiraDeLinha(o));

  const horasPorMaquina = new Map<string, number>();
  const horasPorOperador = new Map<string, number>();
  for (const o of operacoesRaw) {
    const numero = (Array.isArray(o.pa_empilhadeiras) ? o.pa_empilhadeiras[0] : o.pa_empilhadeiras)?.numero ?? "—";
    const horas = horasDeOperacao(operacaoEmpilhadeiraDeLinha(o));
    horasPorMaquina.set(numero, (horasPorMaquina.get(numero) ?? 0) + horas);
    horasPorOperador.set(o.operador_nome, (horasPorOperador.get(o.operador_nome) ?? 0) + horas);
  }
  const barrasHorasMaquina: ItemBarra[] = [...horasPorMaquina.entries()]
    .map(([numero, h]) => ({ rotulo: numero, valor: Math.round(h * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor);
  const barrasHorasOperador: ItemBarra[] = [...horasPorOperador.entries()]
    .map(([nome, h]) => ({ rotulo: nome, valor: Math.round(h * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
  const horasEmpilhadeiraTotal = Math.round(operacoes.reduce((s, op) => s + horasDeOperacao(op), 0) * 10) / 10;

  // ---- % de avaria: geral e por transportadora ----
  type ItemRec = { quantidade_recebida: number; quantidade_avariada: number };
  const todosItens: ItemRec[] = (recebimentosBanco ?? []).flatMap((r) => r.pa_recebimento_itens ?? []);
  const pctAvariaGeral = pctAvariaConsolidado(
    todosItens.map((i) => ({
      id: "",
      produtoId: "",
      produtoCodigo: "",
      produtoDescricao: "",
      quantidadeRecebida: i.quantidade_recebida,
      quantidadeAvariada: i.quantidade_avariada,
      pctAvaria: 0,
    })),
  );

  const avariaPorTransportadora = new Map<string, { recebido: number; avariado: number }>();
  for (const r of recebimentosBanco ?? []) {
    const t = Array.isArray(r.pa_transportadoras) ? r.pa_transportadoras[0] : r.pa_transportadoras;
    const nome = t?.nome ?? "—";
    const atual = avariaPorTransportadora.get(nome) ?? { recebido: 0, avariado: 0 };
    for (const i of r.pa_recebimento_itens ?? []) {
      atual.recebido += i.quantidade_recebida;
      atual.avariado += i.quantidade_avariada;
    }
    avariaPorTransportadora.set(nome, atual);
  }
  const barrasAvariaTransportadora: ItemBarra[] = [...avariaPorTransportadora.entries()]
    .filter(([, v]) => v.recebido > 0)
    .map(([nome, v]) => ({
      rotulo: nome,
      valor: Math.round((v.avariado / v.recebido) * 1000) / 10,
      detalhe: `${nome}: ${v.avariado} de ${v.recebido} un avariadas`,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ---- Ranking ----
  const ranking = construirRanking(
    reepacks.map((r) => ({
      colaboradorId: r.colaborador_id,
      colaboradorNome: r.colaborador_nome,
      embalagemId: r.embalagem_id,
      quantidade: r.quantidade,
      inicio: r.inicio,
      fim: r.fim,
    })),
    despejos.map((d) => ({
      colaboradorId: d.colaborador_id,
      colaboradorNome: d.colaborador_nome,
      embalagemId: d.embalagem_id,
      litros: d.litros,
      inicio: d.inicio,
      fim: d.fim,
    })),
    pickings.map((p) => ({
      colaboradorId: p.colaborador_id,
      colaboradorNome: p.colaborador_nome,
      posicoesReabastecidas: p.posicoes_reabastecidas,
    })),
    embalagens,
  );

  return (
    <div>
      <PageHeader title="Indicadores e Ranking" subtitle="Produtividade do Armazém no período." />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className={rotulo} htmlFor="de">De</label>
          <input id="de" type="date" name="de" defaultValue={de} className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="ate">Até</label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="turno">Turno</label>
          <select id="turno" name="turno" defaultValue={turnoFiltro ?? ""} className={campo}>
            <option value="">Todos</option>
            {TURNOS.map((t) => (
              <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoHero titulo="Reepack no período" valor={String(reepacks.length)} legenda="lançamentos" />
        <CartaoHero titulo="Despejo no período" valor={`${despejos.reduce((s, d) => s + d.litros, 0).toFixed(0)} L`} />
        <CartaoHero titulo="Empilhadeira ativa" valor={`${horasEmpilhadeiraTotal}h`} legenda="soma de todas as máquinas" />
        <CartaoHero
          titulo="% de avaria no recebido"
          valor={`${pctAvariaGeral}%`}
          alerta={pctAvariaGeral > 2}
          positivo={pctAvariaGeral > 0 && pctAvariaGeral <= 2}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <BarraRanking
          titulo="Reepack por colaborador"
          subtitulo="Total de unidades no período"
          itens={barrasReepackColaborador}
          sufixo="un"
        />
        <BarraRanking
          titulo="Despejo por colaborador"
          subtitulo="Total de litros no período"
          itens={barrasDespejoColaborador}
          sufixo="L"
        />
        <BarraRanking
          titulo="Atividade por turno"
          subtitulo="Reepack + despejo + picking, somados"
          itens={barrasPorTurno}
          sufixo="lançamentos"
          tom="gold"
        />
        <BarraRanking
          titulo="% de avaria por transportadora"
          subtitulo="Avariado sobre recebido"
          itens={barrasAvariaTransportadora}
          sufixo="%"
        />
        <BarraRanking
          titulo="Empilhadeira: horas por máquina"
          itens={barrasHorasMaquina}
          sufixo="h"
        />
        <BarraRanking
          titulo="Empilhadeira: horas por operador"
          itens={barrasHorasOperador}
          sufixo="h"
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase text-slate-500">
            Ranking{turnoFiltro ? ` — ${ROTULO_TURNO[turnoFiltro]}` : ""}
          </h2>
          <p className="text-xs text-slate-400">Empate: desempata quem fez mais lançamentos</p>
        </div>
        {ranking.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nada no período.</p>
        ) : (
          <ol className="space-y-2">
            {ranking.map((r, i) => (
              <li key={r.colaboradorId} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary-dark">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </span>
                    <p className="text-sm font-bold text-slate-900">{r.colaboradorNome}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                    {r.pontuacao} pts
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
                  {r.totalReepacks > 0 && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                      📦 {r.totalReepacks} un reepack{r.reepacksPctMeta !== null ? ` · ${r.reepacksPctMeta}% da meta` : ""}
                    </span>
                  )}
                  {r.totalDespejoLitros > 0 && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                      🧴 {r.totalDespejoLitros} L despejo{r.despejoPctMeta !== null ? ` · ${r.despejoPctMeta}% da meta` : ""}
                    </span>
                  )}
                  {r.posicoesPicking > 0 && (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                      🧺 {r.posicoesPicking} posições picking
                    </span>
                  )}
                  {r.totalReepacks === 0 && r.totalDespejoLitros === 0 && r.posicoesPicking === 0 && (
                    <span className="text-[11px] text-slate-400">Sem atividade registrada no período.</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <BarraRanking
          titulo="Reepack por embalagem"
          subtitulo="Taxa média no período"
          itens={reepackPorEmbalagem.map((l) => ({
            rotulo: `${l.embalagemNome} (${embalagemPorId.get(l.embalagemId)?.unidadeReepack ?? "un"})`,
            valor: l.taxa,
            detalhe: `${l.embalagemNome}: ${l.quantidade} ${embalagemPorId.get(l.embalagemId)?.unidadeReepack ?? "un"} em ${l.horas}h${l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""}`,
          }))}
          sufixo="/h"
        />
        <BarraRanking
          titulo="Despejo por embalagem"
          subtitulo="Litros/hora, já convertidos"
          itens={despejoPorEmbalagem.map((l) => ({
            rotulo: l.embalagemNome,
            valor: l.taxa,
            detalhe: `${l.embalagemNome}: ${l.quantidade} L em ${l.horas}h${l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""}`,
          }))}
          sufixo="L/h"
          tom="gold"
        />
      </div>
    </div>
  );
}
