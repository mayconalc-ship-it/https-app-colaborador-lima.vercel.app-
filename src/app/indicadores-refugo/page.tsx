import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { BarrasHorizontais } from "@/components/indicadores/Graficos";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { lerTudoEmPaginas } from "@/lib/rating-server";
import { formatarData, hojeISO } from "@/lib/produtividade-armazem";
import { diasAntes, diasNoIntervalo } from "@/lib/rating";
import { formatarReais, resumirRefugo, somarDefeitos } from "@/lib/refugo";
import {
  agruparAfericoes,
  evolucaoDoRefugo,
  granularidadeDoPeriodo,
  incidenciaPorPlaca,
  rotuloDoPeriodo,
  type AfericaoParaIndicador,
  type Granularidade,
  type LinhaDoRanking,
} from "@/lib/refugo-indicadores";

export const dynamic = "force-dynamic";

/** Um ano: o relatório tem ~460 aferições por ano em São Félix, e a
 *  análise do dono é justamente a do acumulado. */
const MAXIMO_DE_DIAS = 366;
const ROTA = "/indicadores-refugo";

type Linha = {
  data: string;
  mapa: string;
  placa: string | null;
  veiculo: string | null;
  tipo_sorteio: string | null;
  pct_incidencia_veiculo: number | null;
  motorista_nome: string | null;
  conferente_nome: string | null;
  item_codigo: string;
  item_descricao: string | null;
  total_aferido: number;
  qt_faltante: number;
  qt_qualidade: number;
  defeitos: Record<string, number> | null;
};

const COLUNAS =
  "data, mapa, placa, veiculo, tipo_sorteio, pct_incidencia_veiculo, motorista_nome, conferente_nome, item_codigo, item_descricao, total_aferido, qt_faltante, qt_qualidade, defeitos";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

/**
 * INDICADORES DO REFUGO -- a operação inteira (pedido do dono, 11/09/2026).
 *
 * "Meu Refugo" é o espelho de cada pessoa, e o banco só entrega a ela as
 * próprias aferições (RLS da migration 073). Aqui a leitura é pelo
 * servidor, com o cliente de serviço, DEPOIS de conferir que a pessoa tem
 * o módulo "refugo-indicadores" liberado -- a política do banco continua
 * fechada, e só esta tela, com esta checagem, abre o conjunto.
 */
export default async function IndicadoresDoRefugoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; sorteio?: string }>;
}) {
  await requireAcessoModulo("refugo-indicadores");
  const sp = await searchParams;

  const hoje = hojeISO();
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  let de = iso(sp.de) ?? diasAntes(hoje, 89);
  let ate = iso(sp.ate) ?? hoje;
  if (ate < de) [de, ate] = [ate, de];
  if (diasNoIntervalo(de, ate) > MAXIMO_DE_DIAS) de = diasAntes(ate, MAXIMO_DE_DIAS - 1);
  const sorteio = sp.sorteio?.trim() || null;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  const [{ linhas: brutas }, { data: precos }, { data: cfg }] = await Promise.all([
    // Em páginas: o PostgREST corta em 1.000 linhas sem avisar, e um ano
    // de operação passa disso na revenda maior.
    lerTudoEmPaginas<Linha>((inicio, fim) =>
      admin
        .from("refugo_afericoes")
        .select(COLUNAS)
        .eq("revenda_id", revendaId)
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: true })
        .order("mapa", { ascending: true })
        .order("item_codigo", { ascending: true })
        .range(inicio, fim),
    ),
    admin.from("refugo_itens").select("codigo, valor_unitario").eq("revenda_id", revendaId),
    admin.from("refugo_config").select("ultima_sincronizacao").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  const doPeriodo: AfericaoParaIndicador[] = brutas.map((l) => ({
    data: l.data,
    mapa: l.mapa,
    placa: l.placa,
    veiculo: l.veiculo,
    tipoSorteio: l.tipo_sorteio,
    pctIncidenciaVeiculo: l.pct_incidencia_veiculo === null ? null : Number(l.pct_incidencia_veiculo),
    motoristaNome: l.motorista_nome,
    conferenteNome: l.conferente_nome,
    itemCodigo: l.item_codigo,
    itemDescricao: l.item_descricao,
    totalAferido: l.total_aferido,
    qtFaltante: l.qt_faltante,
    qtQualidade: l.qt_qualidade,
    defeitos: l.defeitos ?? {},
  }));

  // Os tipos de sorteio que o período teve -- os chips do filtro saem daqui,
  // e não de uma lista fixa, para um tipo novo da Ambev aparecer sozinho.
  const tiposDeSorteio = [...new Set(doPeriodo.map((a) => a.tipoSorteio).filter((t): t is string => !!t))].sort();
  const afericoes = sorteio ? doPeriodo.filter((a) => a.tipoSorteio === sorteio) : doPeriodo;

  const valorPorItem = new Map<string, number>();
  for (const p of precos ?? []) {
    if (p.valor_unitario !== null) valorPorItem.set(p.codigo, Number(p.valor_unitario));
  }

  const resumo = resumirRefugo(
    afericoes.map((a) => ({
      totalAferido: a.totalAferido,
      qtFaltante: a.qtFaltante,
      qtQualidade: a.qtQualidade,
      itemCodigo: a.itemCodigo,
    })),
    valorPorItem,
  );
  const mapas = new Set(afericoes.map((a) => `${a.data}|${a.mapa}`)).size;

  const granularidade = granularidadeDoPeriodo(diasNoIntervalo(de, ate));
  const evolucao = evolucaoDoRefugo(afericoes, granularidade, valorPorItem);
  const incidencia = incidenciaPorPlaca(afericoes);

  const porPlaca = agruparAfericoes(afericoes, (a) => a.placa, valorPorItem, (a) => (a.veiculo ? `veículo ${a.veiculo}` : null));
  const porMotorista = agruparAfericoes(afericoes, (a) => a.motoristaNome, valorPorItem);
  const porConferente = agruparAfericoes(afericoes, (a) => a.conferenteNome, valorPorItem);
  const porItem = agruparAfericoes(afericoes, (a) => a.itemDescricao ?? a.itemCodigo, valorPorItem, (a) => a.itemCodigo);
  const porSorteio = agruparAfericoes(doPeriodo, (a) => a.tipoSorteio, valorPorItem);
  const defeitos = somarDefeitos(afericoes);

  const rankingIncidencia = [...incidencia]
    .map(([placa, v]) => ({ chave: v.veiculo ? `${placa} · veículo ${v.veiculo}` : placa, total: v.pct }))
    .sort((a, b) => b.total - a.total);

  const qs = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ de, ate });
    if (sorteio) p.set("sorteio", sorteio);
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `${ROTA}?${p.toString()}`;
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="📈 Indicadores do Refugo"
        subtitle="O refugo da operação inteira: por data, placa, motorista, conferente, item e defeito."
        fecharHref="/meus-indicadores"
      />

      <FiltroDePeriodo de={de} ate={ate} hoje={hoje} sorteio={sorteio} />

      {tiposDeSorteio.length > 1 && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Tipo de sorteio">
          <Chip href={qs({ sorteio: null })} ativo={!sorteio}>
            Todos os sorteios
          </Chip>
          {tiposDeSorteio.map((t) => (
            <Chip key={t} href={qs({ sorteio: t })} ativo={sorteio === t}>
              {t}
            </Chip>
          ))}
        </nav>
      )}

      {afericoes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-3xl">♻️</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {doPeriodo.length === 0 && !cfg?.ultima_sincronizacao
              ? "O relatório de refugo ainda não foi importado nesta revenda."
              : "Nenhuma aferição neste período."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatarData(de)} a {formatarData(ate)}
            {sorteio ? ` · sorteio: ${sorteio}` : ""}
          </p>
        </div>
      ) : (
        <>
          <Hero resumo={resumo} mapas={mapas} de={de} ate={ate} />

          <Evolucao pontos={evolucao} granularidade={granularidade} pctGeral={resumo.pctRefugo} />

          <BarrasHorizontais
            titulo="Tipo de refugo"
            subtitulo="Garrafas por defeito. Faltante é garrafa que não voltou; os outros são defeito de manuseio."
            itens={defeitos.map((d) => ({ chave: d.defeito, total: d.total }))}
            vazio="Nenhum defeito no período. 👏"
            maximoDeItens={14}
          />

          <Tabela
            titulo="Por placa"
            subtitulo="Refugo de cada veículo no período, com o índice de incidência que vem do relatório."
            rotuloChave="Placa"
            linhas={porPlaca}
            pctGeral={resumo.pctRefugo}
            extra={{
              titulo: "Incidência",
              valor: (l) => {
                const v = incidencia.get(l.chave);
                return v ? `${v.pct.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` : "—";
              },
            }}
          />

          <BarrasHorizontais
            titulo="Incidência do veículo"
            subtitulo="O % de incidência do relatório 03.11.34.05, na aferição mais recente de cada placa."
            itens={rankingIncidencia}
            sufixo="%"
            maximoDeItens={10}
            vazio="O relatório não trouxe a incidência dos veículos neste período."
          />

          <Tabela
            titulo="Por motorista"
            subtitulo="Motorista do mapa aferido, como vem no relatório."
            rotuloChave="Motorista"
            linhas={porMotorista}
            pctGeral={resumo.pctRefugo}
          />

          <Tabela
            titulo="Por conferente"
            subtitulo="Quem aferiu: garrafas conferidas e o refugo que encontrou."
            rotuloChave="Conferente"
            linhas={porConferente}
            pctGeral={resumo.pctRefugo}
          />

          <Tabela
            titulo="Por item"
            subtitulo="Código e descrição da garrafa aferida."
            rotuloChave="Item"
            linhas={porItem}
            pctGeral={resumo.pctRefugo}
          />

          {/* Sempre sobre o período inteiro, sem o filtro de sorteio: é
              a tabela que COMPARA os sorteios entre si. */}
          <Tabela
            titulo="Por tipo de sorteio"
            subtitulo="Por que o mapa foi sorteado para aferição. Não segue o filtro acima: compara os sorteios entre si."
            rotuloChave="Sorteio"
            linhas={porSorteio}
            pctGeral={resumo.pctRefugo}
          />

          <p className="text-center text-[11px] text-slate-400">
            Fonte: relatório 03.11.34.05 (refugo de vasilhame)
            {cfg?.ultima_sincronizacao
              ? ` · importado em ${new Date(cfg.ultima_sincronizacao).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : ""}
            {resumo.itensSemValor.length > 0 &&
              ` · valor em reais indisponível: falta o preço de ${resumo.itensSemValor.length} item(ns)`}
          </p>
        </>
      )}
    </div>
  );
}

// ==================== COMPONENTES ====================

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        ativo ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function FiltroDePeriodo({
  de,
  ate,
  hoje,
  sorteio,
}: {
  de: string;
  ate: string;
  hoje: string;
  sorteio: string | null;
}) {
  const atalhos: [string, number][] = [["30 dias", 30], ["90 dias", 90], ["6 meses", 183], ["12 meses", 366]];
  const diasAtuais = diasNoIntervalo(de, ate);
  const extra = sorteio ? `&sorteio=${encodeURIComponent(sorteio)}` : "";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map(([r, n]) => {
          const ativo = ate === hoje && diasAtuais === n;
          return (
            <Link
              key={n}
              href={`${ROTA}?de=${diasAntes(hoje, n - 1)}&ate=${hoje}${extra}`}
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
        <FiltroNoLugar className="mt-2 flex items-end gap-2">
          {sorteio && <input type="hidden" name="sorteio" value={sorteio} />}
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
        </FiltroNoLugar>
        <p className="mt-1.5 text-[11px] text-slate-400">No máximo 12 meses por consulta.</p>
      </details>
    </section>
  );
}

function Hero({
  resumo,
  mapas,
  de,
  ate,
}: {
  resumo: ReturnType<typeof resumirRefugo>;
  mapas: number;
  de: string;
  ate: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 shadow-sm">
      <div className="p-6 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
          {formatarData(de)} a {formatarData(ate)}
        </p>
        <p className="mt-3 text-5xl font-black leading-none tabular-nums">
          {resumo.pctRefugo?.toFixed(2) ?? "—"}
          <span className="text-2xl">%</span>
        </p>
        <p className="mt-1 text-sm text-white/75">
          {resumo.refugo.toLocaleString("pt-BR")} de {resumo.totalAferido.toLocaleString("pt-BR")} garrafas
          aferidas viraram refugo
        </p>
        {resumo.valor !== null && resumo.refugo > 0 && (
          <p className="mt-2 inline-block rounded-lg bg-white/15 px-3 py-1 text-sm font-bold">
            {formatarReais(resumo.valor)}
          </p>
        )}
      </div>
      {/* Faltante e qualidade separados: são problemas de causa diferente
          e, somados, um esconde o outro (ver lib/refugo). */}
      <div className="grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 bg-black/20 text-center text-white">
        <Fatia rotulo="Faltante" valor={resumo.qtFaltante} pct={resumo.pctFaltante} />
        <Fatia rotulo="Qualidade" valor={resumo.qtQualidade} pct={resumo.pctQualidade} />
        <Fatia rotulo="Mapas" valor={mapas} pct={null} />
        <Fatia rotulo="Aferições" valor={resumo.afericoes} pct={null} />
      </div>
    </div>
  );
}

function Fatia({ rotulo, valor, pct }: { rotulo: string; valor: number; pct: number | null }) {
  return (
    <div className="px-1 py-3">
      <p className="text-lg font-bold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/60">{rotulo}</p>
      {pct !== null && <p className="text-[10px] text-white/45">{pct.toFixed(2)}%</p>}
    </div>
  );
}

/** A série no tempo: uma coluna por dia, semana ou mês, com o % de refugo
 *  em cima. A linha tracejada é o % do período inteiro -- é contra ela que
 *  cada coluna se lê. */
function Evolucao({
  pontos,
  granularidade,
  pctGeral,
}: {
  pontos: LinhaDoRanking[];
  granularidade: Granularidade;
  pctGeral: number | null;
}) {
  const maior = Math.max(...pontos.map((p) => p.pct ?? 0), pctGeral ?? 0, 0.01);
  const altura = (v: number) => `${Math.max((v / maior) * 100, v > 0 ? 3 : 0)}%`;
  const nome = granularidade === "dia" ? "dia" : granularidade === "semana" ? "semana" : "mês";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">Por data</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">
        % de refugo por {nome} aferido. Só aparecem os {nome === "mês" ? "meses" : `${nome}s`} com mapa sorteado.
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="relative flex h-40 min-w-full items-end gap-1.5" style={{ width: `${Math.max(pontos.length * 2.6, 10)}rem` }}>
          {pctGeral !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400"
              style={{ bottom: altura(pctGeral) }}
              aria-hidden="true"
            />
          )}
          {pontos.map((p) => {
            const acima = pctGeral !== null && (p.pct ?? 0) > pctGeral;
            return (
              <div
                key={p.chave}
                className="flex h-full min-w-[2.1rem] flex-1 flex-col items-center justify-end"
                title={`${rotuloDoPeriodo(p.chave, granularidade)}: ${p.refugo.toLocaleString("pt-BR")} de ${p.aferido.toLocaleString("pt-BR")} garrafas (${p.pct?.toFixed(2) ?? "—"}%) em ${p.mapas} mapa(s)`}
              >
                <span className="mb-0.5 text-[10px] font-bold tabular-nums text-slate-700">
                  {p.pct === null ? "—" : p.pct.toFixed(1)}
                </span>
                <div
                  className={`w-full rounded-t-md ${acima ? "bg-amber-500" : "bg-sky-600"}`}
                  style={{ height: altura(p.pct ?? 0) }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex min-w-full gap-1.5" style={{ width: `${Math.max(pontos.length * 2.6, 10)}rem` }}>
          {pontos.map((p) => (
            <span key={p.chave} className="min-w-[2.1rem] flex-1 truncate text-center text-[10px] text-slate-400">
              {rotuloDoPeriodo(p.chave, granularidade)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-600" />até a média do período</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />acima da média</span>
        {pctGeral !== null && <span>- - - média: {pctGeral.toFixed(2)}%</span>}
      </p>
    </section>
  );
}

/**
 * Um ranking em tabela. Rola no próprio lugar (para os lados no celular, e
 * para baixo quando passa de umas dez linhas), com a primeira coluna
 * presa -- sem isso, ao rolar para ver o valor ninguém sabe mais de quem
 * é a linha.
 */
function Tabela({
  titulo,
  subtitulo,
  rotuloChave,
  linhas,
  pctGeral,
  extra,
}: {
  titulo: string;
  subtitulo: string;
  rotuloChave: string;
  linhas: LinhaDoRanking[];
  pctGeral: number | null;
  extra?: { titulo: string; valor: (l: LinhaDoRanking) => string };
}) {
  const num = (v: number) => v.toLocaleString("pt-BR");
  const cel = "px-2 py-2 text-right tabular-nums";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="p-4 pb-2">
        <h2 className="text-sm font-bold text-slate-900">
          {titulo} <span className="font-normal text-slate-400">({linhas.length})</span>
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">{subtitulo}</p>
      </div>
      <div className="max-h-[26rem] overflow-auto border-t border-slate-100">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left">{rotuloChave}</th>
              <th className="px-2 py-2 text-right">Aferições</th>
              <th className="px-2 py-2 text-right">Aferido</th>
              <th className="px-2 py-2 text-right">Faltante</th>
              <th className="px-2 py-2 text-right">Qualidade</th>
              <th className="px-2 py-2 text-right">% refugo</th>
              {extra && <th className="px-2 py-2 text-right">{extra.titulo}</th>}
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const acima = pctGeral !== null && l.pct !== null && l.pct > pctGeral;
              return (
                <tr key={l.chave} className="border-t border-slate-100">
                  <td className="sticky left-0 z-[5] max-w-[12rem] bg-white px-3 py-2">
                    <p className="truncate font-semibold text-slate-800" title={l.chave}>{l.chave}</p>
                    {l.detalhe && <p className="truncate text-[10px] text-slate-400">{l.detalhe}</p>}
                  </td>
                  <td className={cel}>{num(l.afericoes)}</td>
                  <td className={cel}>{num(l.aferido)}</td>
                  <td className={cel}>{num(l.faltante)}</td>
                  <td className={cel}>{num(l.qualidade)}</td>
                  <td className={`${cel} font-bold ${acima ? "text-amber-700" : "text-slate-800"}`}>
                    {l.pct === null ? "—" : `${l.pct.toFixed(2)}%`}
                  </td>
                  {extra && <td className={cel}>{extra.valor(l)}</td>}
                  <td className={`${cel} pr-3`}>{l.valor === null ? "—" : l.refugo > 0 ? formatarReais(l.valor) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-slate-400">
        Do maior refugo ao menor. Em âmbar, % acima da média do período
        {pctGeral !== null ? ` (${pctGeral.toFixed(2)}%)` : ""}.
      </p>
    </section>
  );
}
