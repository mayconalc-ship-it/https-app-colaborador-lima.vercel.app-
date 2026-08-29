import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarData, hojeISO } from "@/lib/produtividade-armazem";
import { diasAntes, diasNoIntervalo, serieDeDias } from "@/lib/rating";
import {
  META_PADRAO_PCT,
  ROTULO_RESPONSABILIDADE,
  formatarReais,
  pctDoDia,
  pctPdvDoDia,
  precisaJustificar,
  porPdv,
  resumirDevolucao,
  type Responsabilidade,
} from "@/lib/devolucao";
import { BarrasHorizontais, FaixaDeDias } from "@/components/indicadores/Graficos";
import { justificarDia } from "./actions";

export const dynamic = "force-dynamic";

const MAXIMO_DE_DIAS = 92;

type Dia = {
  data: string;
  motorista_colaborador_id: string | null;
  /** O indicador principal: pontos de venda distintos. */
  pdvs_entregues: number;
  pdvs_devolvidos: number;
  notas_entregues: number;
  valor_entregue: number;
  notas_devolvidas: number;
  valor_devolvido: number;
  valor_fora_do_indicador: number;
};

type Nota = {
  id: string;
  data: string;
  nota: string;
  mapa: string | null;
  motivo_codigo: string | null;
  cliente_nome: string | null;
  valor: number;
  motorista_colaborador_id: string | null;
};

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function DevolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; dia?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("devolucao");
  const sp = await searchParams;

  const hoje = hojeISO();
  const diaSelecionado = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : null;
  let de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : diasAntes(hoje, 29);
  let ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : hoje;
  if (ate < de) [de, ate] = [ate, de];
  if (diasNoIntervalo(de, ate) > MAXIMO_DE_DIAS) de = diasAntes(ate, MAXIMO_DE_DIAS - 1);

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();

  // O RLS já limita ao próprio dado (migration 074).
  const [{ data: diasBanco }, { data: notasBanco }, { data: cfg }, { data: motivosBanco }] = await Promise.all([
    supabase
      .from("devolucao_dia")
      .select("data, motorista_colaborador_id, pdvs_entregues, pdvs_devolvidos, notas_entregues, valor_entregue, notas_devolvidas, valor_devolvido, valor_fora_do_indicador")
      .eq("revenda_id", revendaId)
      .gte("data", de)
      .lte("data", ate)
      .order("data", { ascending: false })
      .limit(500),
    supabase
      .from("devolucao_notas")
      .select("id, data, nota, mapa, motivo_codigo, cliente_nome, valor, motorista_colaborador_id")
      .eq("revenda_id", revendaId)
      .gte("data", de)
      .lte("data", ate)
      .order("valor", { ascending: false })
      .limit(500),
    supabase.from("devolucao_config").select("meta_pct").eq("revenda_id", revendaId).maybeSingle(),
    supabase.from("devolucao_motivos").select("codigo, descricao, responsabilidade, conta_no_indicador").eq("revenda_id", revendaId),
  ]);

  const meta = Number(cfg?.meta_pct ?? META_PADRAO_PCT);
  const motivos = new Map(
    (motivosBanco ?? []).map((m) => [
      m.codigo,
      {
        descricao: m.descricao,
        responsabilidade: m.responsabilidade as Responsabilidade,
        contaNoIndicador: m.conta_no_indicador !== false,
      },
    ]),
  );
  const doMotivo = (codigo: string | null) => (codigo ? motivos.get(codigo) : undefined);

  const todosDias = (diasBanco ?? []) as Dia[];
  const todasNotas = (notasBanco ?? []) as Nota[];

  const dias = diaSelecionado ? todosDias.filter((d) => d.data === diaSelecionado) : todosDias;
  const notas = diaSelecionado ? todasNotas.filter((n) => n.data === diaSelecionado) : todasNotas;

  const entregue = dias.reduce((s, d) => s + Number(d.valor_entregue), 0);
  const devolvido = dias.reduce((s, d) => s + Number(d.valor_devolvido), 0);
  const fora = dias.reduce((s, d) => s + Number(d.valor_fora_do_indicador), 0);

  // O indicador PRINCIPAL é por ponto de venda -- é como a operação mede,
  // inclusive para a RV. O valor fica em segundo plano.
  const pdvsEntregues = dias.reduce((s, d) => s + Number(d.pdvs_entregues ?? 0), 0);
  const pdvsDevolvidos = dias.reduce((s, d) => s + Number(d.pdvs_devolvidos ?? 0), 0);
  const pctPeriodo = pctPdvDoDia(pdvsEntregues, pdvsDevolvidos);
  const pctValor = pctDoDia(entregue, devolvido, fora);

  const resumo = resumirDevolucao(
    notas.map((n) => {
      const m = doMotivo(n.motivo_codigo);
      return {
        valor: Number(n.valor),
        responsabilidade: m?.responsabilidade ?? "nao_classificado",
        contaNoIndicador: m?.contaNoIndicador ?? false,
      };
    }),
  );

  // A régua do dia é a mesma do indicador: por ponto de venda.
  const pctDia = (d: Dia) => pctPdvDoDia(Number(d.pdvs_entregues ?? 0), Number(d.pdvs_devolvidos ?? 0));
  const acimaDaMeta = todosDias.filter((d) => precisaJustificar(pctDia(d), meta));
  const { data: jaJustificados } = acimaDaMeta.length
    ? await supabase
        .from("devolucao_justificativas")
        .select("data, texto, criado_em")
        .in("data", acimaDaMeta.map((d) => d.data))
    : { data: [] };
  const justificativaPorDia = new Map((jaJustificados ?? []).map((j) => [j.data, j]));

  const pendentes = diaSelecionado ? acimaDaMeta.filter((d) => d.data === diaSelecionado) : acimaDaMeta;

  // Três estados no calendário, a pedido do dono: verde para o dia que
  // teve entrega e nenhuma devolução, âmbar para o dia que teve devolução
  // mas ficou na meta, e vermelho para o dia que estourou.
  const porData = new Map(todosDias.map((d) => [d.data, d]));
  const faixa = serieDeDias(
    de,
    ate,
    todosDias.map((d) => ({ dataAvaliacao: d.data, nota: Number(d.pdvs_devolvidos ?? 0) > 0 ? 1 : 5 })),
    MAXIMO_DE_DIAS,
  ).map((d) => {
    const doDia = porData.get(d.dia);
    const pct = doDia ? pctDia(doDia) : null;
    return {
      dia: d.dia,
      total: doDia ? Number(doDia.pdvs_entregues ?? 0) + Number(doDia.pdvs_devolvidos ?? 0) : 0,
      alerta: doDia ? Number(doDia.pdvs_devolvidos ?? 0) : 0,
      grave: precisaJustificar(pct, meta),
      titulo: !doDia
        ? `${formatarData(d.dia)} — você não entregou neste dia`
        : `${formatarData(d.dia)} — ${doDia.pdvs_entregues} PDV(s) atendidos, ${doDia.pdvs_devolvidos} com devolução` +
          (pct === null ? "" : ` (${pct.toFixed(2)}%, meta ${meta}%)`),
    };
  });

  const qs = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ de, ate });
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/devolucao?${p.toString()}`;
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Minha Devolução"
        subtitle={`O que voltou das suas entregas. Meta: até ${meta}% do valor.`}
        fecharHref="/"
      />

      {sp.erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>}

      <FiltroDePeriodo de={de} ate={ate} hoje={hoje} />

      <Hero
        pct={pctPeriodo}
        pctValor={pctValor}
        meta={meta}
        pdvsEntregues={pdvsEntregues}
        pdvsDevolvidos={pdvsDevolvidos}
        entregue={entregue}
        resumo={resumo}
        de={de}
        ate={ate}
        dia={diaSelecionado}
      />

      <FaixaDeDias
        dias={faixa}
        diaSelecionado={diaSelecionado}
        base={(d) => qs({ dia: d === diaSelecionado ? null : d })}
        rotulos={{
          titulo: "Seus dias no período",
          bom: "Entregou sem devolução",
          alerta: `Teve devolução, dentro da meta`,
          grave: `Acima da meta (${meta}%)`,
          vazio: "Sem entrega",
          aviso: (n) =>
            n === 1
              ? "1 dia acima da meta — toque nele para explicar."
              : `${n} dias acima da meta — toque neles para explicar.`,
        }}
      />

      {diaSelecionado && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Vendo só {formatarData(diaSelecionado)}</p>
            <p className="text-[11px] text-white/60">
              {dias.length === 0 ? "sem entrega neste dia" : `${notas.length} devolução(ões)`}
            </p>
          </div>
          <Link href={qs({ dia: null })} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25">
            Ver o período
          </Link>
        </div>
      )}

      {/* ---------- DIAS QUE PEDEM EXPLICAÇÃO ---------- */}
      {pendentes.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-bold text-slate-900">
            {pendentes.length === 1 ? "1 dia acima da meta" : `${pendentes.length} dias acima da meta`}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Conta pra gente o que aconteceu. Boa parte da devolução é do cliente ou da operação — sua explicação
            é o que separa uma coisa da outra.
          </p>
          <ul className="space-y-3">
            {pendentes.map((d) => (
              <CartaoDoDia
                key={d.data}
                dia={d}
                meta={meta}
                de={de}
                ate={ate}
                diaSelecionado={diaSelecionado}
                notasDoDia={todasNotas.filter((n) => n.data === d.data)}
                motivos={motivos}
                justificativa={justificativaPorDia.get(d.data) ?? null}
                souMotorista={d.motorista_colaborador_id === perfil.id}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- ANÁLISES ---------- */}
      {notas.length > 0 ? (
        <>
          <PorResponsabilidade resumo={resumo} />

          <BarrasHorizontais
            titulo="Motivos da devolução"
            subtitulo="Por que a mercadoria voltou"
            itens={contarMotivos(notas, motivos)}
            vazio="Nenhuma devolução no período."
            maximoDeItens={10}
          />

          <BarrasHorizontais
            titulo="Devolução por PDV"
            subtitulo="Quanto voltou de cada cliente, em reais"
            itens={porPdv(
              notas.map((n) => ({
                clienteCodigo: null,
                clienteNome: n.cliente_nome,
                valor: Number(n.valor),
                contaNoIndicador: doMotivo(n.motivo_codigo)?.contaNoIndicador ?? false,
              })),
            )}
            vazio="Nenhum cliente devolveu no período."
            maximoDeItens={10}
          />

          <BarrasHorizontais
            titulo="PDVs que mais devolveram"
            subtitulo="Pela quantidade de notas, não pelo valor"
            itens={contarClientes(notas)}
            vazio="Nenhum cliente devolveu no período."
          />

          <ListaDeNotas notas={notas} motivos={motivos} />
        </>
      ) : (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-1 text-sm font-bold text-green-800">Nenhuma devolução no período</p>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTES ====================

type MapaDeMotivos = Map<string, { descricao: string; responsabilidade: Responsabilidade }>;

function contarMotivos(notas: Nota[], motivos: MapaDeMotivos) {
  const m = new Map<string, number>();
  for (const n of notas) {
    const nome = (n.motivo_codigo ? motivos.get(n.motivo_codigo)?.descricao : null) ?? "Sem motivo informado";
    m.set(nome, (m.get(nome) ?? 0) + 1);
  }
  return [...m].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
}

function contarClientes(notas: Nota[]) {
  const m = new Map<string, number>();
  for (const n of notas) {
    if (!n.cliente_nome) continue;
    m.set(n.cliente_nome, (m.get(n.cliente_nome) ?? 0) + 1);
  }
  return [...m].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
}

function FiltroDePeriodo({ de, ate, hoje }: { de: string; ate: string; hoje: string }) {
  const atalhos: [string, number][] = [["7 dias", 7], ["15 dias", 15], ["30 dias", 30], ["90 dias", 90]];
  const atuais = diasNoIntervalo(de, ate);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map(([r, n]) => {
          const ativo = ate === hoje && atuais === n;
          return (
            <Link
              key={n}
              href={`/devolucao?de=${diasAntes(hoje, n - 1)}&ate=${hoje}`}
              aria-current={ativo ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                ativo ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r}
            </Link>
          );
        })}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
          Escolher outro período
        </summary>
        <form method="get" className="mt-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500" htmlFor="de">De</label>
            <input id="de" type="date" name="de" defaultValue={de} max={hoje} className={campo} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500" htmlFor="ate">Até</label>
            <input id="ate" type="date" name="ate" defaultValue={ate} max={hoje} className={campo} />
          </div>
          <button type="submit" className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">
            Ver
          </button>
        </form>
      </details>
    </section>
  );
}

function Hero({
  pct,
  pctValor,
  meta,
  pdvsEntregues,
  pdvsDevolvidos,
  entregue,
  resumo,
  de,
  ate,
  dia,
}: {
  pct: number | null;
  pctValor: number | null;
  meta: number;
  pdvsEntregues: number;
  pdvsDevolvidos: number;
  entregue: number;
  resumo: ReturnType<typeof resumirDevolucao>;
  de: string;
  ate: string;
  dia: string | null;
}) {
  const rotulo = dia ? formatarData(dia) : `${formatarData(de)} a ${formatarData(ate)}`;

  if (pct === null) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-4xl">↩️</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Sem entrega no período</p>
        <p className="mt-1 text-xs text-slate-400">{rotulo}</p>
      </div>
    );
  }

  const dentro = pct <= meta;
  return (
    <div
      className={`overflow-hidden rounded-3xl shadow-sm ${
        dentro ? "bg-gradient-to-br from-emerald-600 to-teal-700" : "bg-gradient-to-br from-rose-700 to-red-800"
      }`}
    >
      <div className="p-6 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{rotulo}</p>
        {/* O número grande é por PDV -- é como a operação mede. */}
        <p className="mt-3 text-5xl font-black leading-none tabular-nums">
          {pct.toFixed(2)}
          <span className="text-2xl">%</span>
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/70">dos pontos de venda</p>
        <p className="mt-2 text-sm text-white/80">
          {pdvsDevolvidos} de {pdvsEntregues + pdvsDevolvidos} PDVs com devolução
        </p>
        <p className="mt-1 text-sm text-white/80">
          {dentro ? `dentro da meta de ${meta}%` : `acima da meta de ${meta}%`}
        </p>
      </div>

      {/* O valor continua existindo, em segundo plano. */}
      <div className="border-t border-white/20 bg-black/10 px-4 py-3 text-center text-white">
        <p className="text-xs text-white/70">
          Em valor: <strong>{formatarReais(resumo.valor)}</strong> de {formatarReais(entregue)} entregues
          {pctValor !== null && <span className="text-white/50"> · {pctValor.toFixed(2)}%</span>}
        </p>
      </div>
    </div>
  );
}

/** O coração do módulo: o valor sempre com a responsabilidade do lado.
 *  Sozinho, o número vira acusação. */
function PorResponsabilidade({ resumo }: { resumo: ReturnType<typeof resumirDevolucao> }) {
  const faixas: Responsabilidade[] = ["mercado", "armazem_financeiro", "vendas", "entrega"];
  const maior = Math.max(...faixas.map((f) => resumo.porResponsabilidade[f].valor), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">De quem foi a devolução</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">
        A mesma devolução tem causas bem diferentes — e a maioria não é da entrega
      </p>

      <ul className="mt-3 space-y-3">
        {faixas.map((f) => {
          const v = resumo.porResponsabilidade[f];
          return (
            <li key={f}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{ROTULO_RESPONSABILIDADE[f].longo}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-900">
                  <strong>{formatarReais(v.valor)}</strong>
                  <span className="ml-1 text-slate-400">
                    ({v.notas} {v.notas === 1 ? "nota" : "notas"})
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max((v.valor / maior) * 100, v.valor > 0 ? 3 : 0)}%`, background: "#0b4da2" }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{ROTULO_RESPONSABILIDADE[f].ajuda}</p>
            </li>
          );
        })}
      </ul>

      {resumo.foraDoIndicador.notas > 0 && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">
          Mais {resumo.foraDoIndicador.notas} nota(s) de {formatarReais(resumo.foraDoIndicador.valor)} que{" "}
          <strong>não entram na sua conta</strong> — transferência para a fábrica e cancelamento fiscal.
        </p>
      )}
    </section>
  );
}

function CartaoDoDia({
  dia,
  meta,
  de,
  ate,
  diaSelecionado,
  notasDoDia,
  motivos,
  justificativa,
  souMotorista,
}: {
  dia: Dia;
  meta: number;
  de: string;
  ate: string;
  diaSelecionado: string | null;
  notasDoDia: Nota[];
  motivos: MapaDeMotivos;
  justificativa: { texto: string; criado_em: string } | null;
  souMotorista: boolean;
}) {
  const pct = pctPdvDoDia(Number(dia.pdvs_entregues ?? 0), Number(dia.pdvs_devolvidos ?? 0));

  return (
    <li className="overflow-hidden rounded-2xl border border-rose-200 bg-white">
      <div className="bg-rose-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{formatarData(dia.data)}</p>
            <p className="text-xs text-slate-500">
              {dia.pdvs_devolvidos} de {Number(dia.pdvs_entregues ?? 0) + Number(dia.pdvs_devolvidos ?? 0)} PDVs
              com devolução
            </p>
            <p className="text-[11px] text-slate-400">
              {formatarReais(Number(dia.valor_devolvido))} · você era o {souMotorista ? "motorista" : "ajudante"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold tabular-nums text-rose-800">{pct?.toFixed(2)}%</p>
            <p className="text-[11px] text-slate-400">meta {meta}%</p>
          </div>
        </div>

        {notasDoDia.length > 0 && (
          <ul className="mt-2 space-y-1">
            {notasDoDia.slice(0, 5).map((n) => (
              <li key={n.id} className="truncate text-[11px] text-slate-600">
                {n.cliente_nome ?? "cliente"} · {formatarReais(Number(n.valor))} ·{" "}
                {(n.motivo_codigo ? motivos.get(n.motivo_codigo)?.descricao : null) ?? "sem motivo"}
              </li>
            ))}
            {notasDoDia.length > 5 && (
              <li className="text-[11px] text-slate-400">e mais {notasDoDia.length - 5}…</li>
            )}
          </ul>
        )}
      </div>

      <form action={justificarDia} className="space-y-2 p-4">
        <input type="hidden" name="data" value={dia.data} />
        <input type="hidden" name="de" value={de} />
        <input type="hidden" name="ate" value={ate} />
        {diaSelecionado && <input type="hidden" name="dia" value={diaSelecionado} />}

        <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor={`texto-${dia.data}`}>
          {justificativa ? "Sua explicação" : "O que aconteceu nesse dia?"}
        </label>
        <textarea
          id={`texto-${dia.data}`}
          name="texto"
          rows={3}
          maxLength={1000}
          required
          defaultValue={justificativa?.texto ?? ""}
          placeholder="Ex.: dois clientes estavam fechados e um não tinha dinheiro; voltei no dia seguinte…"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
        />
        <BotaoEnviar
          textoEnviando="Enviando..."
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {justificativa ? "Atualizar explicação" : "Enviar explicação"}
        </BotaoEnviar>
        {justificativa && (
          <p className="text-center text-[11px] text-slate-400">
            Respondido em {formatarData(justificativa.criado_em.slice(0, 10))}
          </p>
        )}
      </form>
    </li>
  );
}

function ListaDeNotas({ notas, motivos }: { notas: Nota[]; motivos: MapaDeMotivos }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-slate-900">Nota a nota</h2>
      <ul className="space-y-2">
        {notas.slice(0, 50).map((n) => {
          const m = n.motivo_codigo ? motivos.get(n.motivo_codigo) : undefined;
          const resp = m?.responsabilidade ?? "nao_classificado";
          return (
            <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{n.cliente_nome ?? "Cliente"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {formatarData(n.data)} · NF {n.nota}
                    {n.mapa ? ` · mapa ${n.mapa}` : ""}
                  </p>
                  <p className="mt-1 inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {m?.descricao ?? "sem motivo"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-slate-900">{formatarReais(Number(n.valor))}</p>
                  <p className="text-[11px] text-slate-400">{ROTULO_RESPONSABILIDADE[resp].curto}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {notas.length > 50 && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          mostrando as 50 maiores de {notas.length}
        </p>
      )}
    </section>
  );
}
