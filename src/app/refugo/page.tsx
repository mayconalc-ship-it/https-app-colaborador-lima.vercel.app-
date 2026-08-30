import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarData, hojeISO } from "@/lib/produtividade-armazem";
import { diasAntes, diasNoIntervalo, serieDeDias } from "@/lib/rating";
import {
  TEXTO_DO_ALERTA,
  alertaDaAfericao,
  formatarReais,
  resumirRefugo,
  somarDefeitos,
  type Alerta,
} from "@/lib/refugo";
import { BarrasHorizontais, FaixaDeDias } from "@/components/indicadores/Graficos";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { justificarRefugo } from "./actions";

type Justificativa = { afericao_id: string; texto: string; criado_em: string };

export const dynamic = "force-dynamic";

const MAXIMO_DE_DIAS = 92;

type Afericao = {
  id: string;
  data: string;
  mapa: string;
  placa: string | null;
  tipo_sorteio: string | null;
  item_codigo: string;
  item_descricao: string | null;
  total_aferido: number;
  qt_boa: number;
  qt_faltante: number;
  qt_qualidade: number;
  defeitos: Record<string, number>;
  motorista_colaborador_id: string | null;
  motorista_nome: string | null;
  conferente_colaborador_id: string | null;
  conferente_nome: string | null;
};

const COLUNAS =
  "id, data, mapa, placa, tipo_sorteio, item_codigo, item_descricao, total_aferido, qt_boa, qt_faltante, qt_qualidade, defeitos, motorista_colaborador_id, motorista_nome, conferente_colaborador_id, conferente_nome";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function RefugoPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    dia?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await requireAcessoModulo("refugo");
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

  // O RLS já limita ao próprio refugo (migration 073) -- motorista,
  // ajudante ou conferente daquela aferição. Não existe filtro por pessoa
  // aqui de propósito.
  const [{ data: doPeriodo }, { data: precos }] = await Promise.all([
    supabase
      .from("refugo_afericoes")
      .select(COLUNAS)
      .eq("revenda_id", revendaId)
      .gte("data", de)
      .lte("data", ate)
      .order("data", { ascending: false })
      // 1.000 é o teto do PostgREST, não uma escolha. Cabe com folga: o
      // RLS entrega só as aferições da própria pessoa, e são 434 no ano
      // inteiro para a operação toda.
      .limit(1000),
    supabase.from("refugo_itens").select("codigo, valor_unitario").eq("revenda_id", revendaId),
  ]);

  const periodo = (doPeriodo ?? []) as Afericao[];
  const emFoco = diaSelecionado ? periodo.filter((a) => a.data === diaSelecionado) : periodo;

  const valorPorItem = new Map<string, number>();
  for (const p of precos ?? []) {
    if (p.valor_unitario !== null) valorPorItem.set(p.codigo, Number(p.valor_unitario));
  }

  const resumo = resumirRefugo(
    emFoco.map((a) => ({
      totalAferido: a.total_aferido,
      qtFaltante: a.qt_faltante,
      qtQualidade: a.qt_qualidade,
      itemCodigo: a.item_codigo,
    })),
    valorPorItem,
  );

  // O calendário conta AFERIÇÕES por dia, e marca o dia que teve refugo.
  const dias = serieDeDias(
    de,
    ate,
    periodo.map((a) => ({ dataAvaliacao: a.data, nota: a.qt_faltante + a.qt_qualidade > 0 ? 1 : 5 })),
    MAXIMO_DE_DIAS,
  );

  const destoantes = emFoco
    .map((a) => ({ a, alerta: alertaDaAfericao(a.total_aferido, a.qt_faltante + a.qt_qualidade) }))
    .filter((x): x is { a: Afericao; alerta: Exclude<Alerta, null> } => x.alerta !== null);

  const comRefugo = emFoco.filter((a) => a.qt_faltante + a.qt_qualidade > 0);

  // Só das aferições em foco -- e só se houver alguma com refugo, para
  // não gastar uma ida ao banco num período limpo.
  const { data: justificativasBanco } = comRefugo.length
    ? await supabase
        .from("refugo_justificativas")
        .select("afericao_id, texto, criado_em")
        .in("afericao_id", comRefugo.map((a) => a.id))
    : { data: [] as Justificativa[] };

  const justificativaPorAfericao = new Map(
    ((justificativasBanco ?? []) as Justificativa[]).map((j) => [j.afericao_id, j]),
  );

  const qs = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ de, ate });
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/refugo?${p.toString()}`;
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Meu Refugo"
        subtitle="Como as garrafas que voltaram nos seus mapas foram aferidas."
        fecharHref="/meus-indicadores"
      />

      {sp.erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <FiltroDePeriodo de={de} ate={ate} hoje={hoje} />

      <Hero resumo={resumo} de={de} ate={ate} dia={diaSelecionado} />

      <FaixaDeDias
        dias={dias.map((d) => ({
          dia: d.dia,
          total: d.total,
          alerta: d.abaixoDaMeta,
          titulo:
            d.total === 0
              ? `${formatarData(d.dia)} — nenhum mapa seu foi aferido`
              : `${formatarData(d.dia)} — ${d.total} aferição(ões)` +
                (d.abaixoDaMeta ? `, ${d.abaixoDaMeta} com refugo` : ", nenhum refugo"),
        }))}
        diaSelecionado={diaSelecionado}
        base={(d) => qs({ dia: d === diaSelecionado ? null : d })}
        rotulos={{
          titulo: "Seus dias aferidos",
          bom: "Sem refugo",
          alerta: "Teve refugo",
          vazio: "Não aferido",
          aviso: (n) =>
            n === 1 ? "1 dia com refugo — toque nele para ver." : `${n} dias com refugo — toque neles para ver.`,
        }}
      />

      {diaSelecionado && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Vendo só {formatarData(diaSelecionado)}</p>
            <p className="text-[11px] text-white/60">
              {emFoco.length === 0
                ? "nenhuma aferição neste dia"
                : `${emFoco.length} aferição${emFoco.length > 1 ? "ões" : ""} · ${resumo.refugo} de refugo`}
            </p>
          </div>
          <Link
            href={qs({ dia: null })}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
          >
            Ver o período
          </Link>
        </div>
      )}

      {/* ---------- ALERTA DE DESTOANTE ---------- */}
      {destoantes.map(({ a, alerta }) => (
        <section key={a.id} className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-900">⚠️ {TEXTO_DO_ALERTA[alerta].titulo}</p>
          <p className="mt-1 text-xs text-red-800">{TEXTO_DO_ALERTA[alerta].explicacao}</p>
          <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-700">
            <p className="font-semibold">
              {formatarData(a.data)} · mapa {a.mapa} · {a.item_descricao ?? a.item_codigo}
            </p>
            <p className="mt-0.5 text-slate-500">
              {(a.qt_faltante + a.qt_qualidade).toLocaleString("pt-BR")} de{" "}
              {a.total_aferido.toLocaleString("pt-BR")} garrafas —{" "}
              {((a.qt_faltante + a.qt_qualidade) / a.total_aferido * 100).toFixed(1)}%
            </p>
          </div>
          <p className="mt-2 text-[11px] text-red-700">
            Leve o número do mapa para a liderança abrir o chamado de correção — e conte o que
            aconteceu na aferição, aqui embaixo na lista. É onde a sua versão fica registrada
            junto com o número.
          </p>
        </section>
      ))}

      {/* ---------- ANÁLISES ---------- */}
      {emFoco.length > 0 ? (
        <>
          <BarrasHorizontais
            titulo="Tipos de defeito"
            subtitulo="O que apareceu nas garrafas aferidas"
            itens={somarDefeitos(emFoco).map((d) => ({ chave: d.defeito, total: d.total }))}
            vazio="Nenhum defeito no período. 👏"
            maximoDeItens={14}
          />

          <BarrasHorizontais
            titulo="Refugo por tipo de garrafa"
            subtitulo="Onde o refugo se concentra"
            itens={agruparRefugoPorItem(comRefugo)}
            vazio="Nenhum refugo no período."
          />

          <ListaDeAfericoes
            afericoes={emFoco}
            perfilId={perfil.id}
            valorPorItem={valorPorItem}
            justificativaPorAfericao={justificativaPorAfericao}
            de={de}
            ate={ate}
            dia={diaSelecionado}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-500">Nenhum mapa seu foi aferido no período</p>
          <p className="mt-1 text-xs text-slate-400">
            Nem todo mapa passa por aferição — só os sorteados. Período sem aferição não é período sem trabalho.
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTES ====================

function agruparRefugoPorItem(afericoes: Afericao[]) {
  const mapa = new Map<string, number>();
  for (const a of afericoes) {
    const k = a.item_descricao ?? a.item_codigo;
    mapa.set(k, (mapa.get(k) ?? 0) + a.qt_faltante + a.qt_qualidade);
  }
  return [...mapa]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);
}

function FiltroDePeriodo({ de, ate, hoje }: { de: string; ate: string; hoje: string }) {
  const atalhos: [string, number][] = [["7 dias", 7], ["15 dias", 15], ["30 dias", 30], ["90 dias", 90]];
  const diasAtuais = diasNoIntervalo(de, ate);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map(([r, n]) => {
          const ativo = ate === hoje && diasAtuais === n;
          return (
            <Link
              key={n}
              href={`/refugo?de=${diasAntes(hoje, n - 1)}&ate=${hoje}`}
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
        <p className="mt-1.5 text-[11px] text-slate-400">No máximo {MAXIMO_DE_DIAS} dias por consulta.</p>
      </details>
    </section>
  );
}

function Hero({
  resumo,
  de,
  ate,
  dia,
}: {
  resumo: ReturnType<typeof resumirRefugo>;
  de: string;
  ate: string;
  dia: string | null;
}) {
  const rotulo = dia ? formatarData(dia) : `${formatarData(de)} a ${formatarData(ate)}`;

  if (resumo.afericoes === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-4xl">♻️</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Sem aferição no período</p>
        <p className="mt-1 text-xs text-slate-400">{rotulo}</p>
      </div>
    );
  }

  const limpo = resumo.refugo === 0;

  return (
    <div
      className={`overflow-hidden rounded-3xl shadow-sm ${
        limpo ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-amber-500 to-orange-600"
      }`}
    >
      <div className="p-6 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{rotulo}</p>
        <p className="mt-3 text-5xl font-black leading-none tabular-nums">
          {resumo.pctRefugo?.toFixed(2)}
          <span className="text-2xl">%</span>
        </p>
        <p className="mt-1 text-sm text-white/80">
          {resumo.refugo.toLocaleString("pt-BR")} de {resumo.totalAferido.toLocaleString("pt-BR")} garrafas
          aferidas
        </p>
        {resumo.valor !== null && resumo.refugo > 0 && (
          <p className="mt-2 inline-block rounded-lg bg-black/20 px-3 py-1 text-sm font-bold">
            {formatarReais(resumo.valor)}
          </p>
        )}
      </div>

      {/* Faltante e qualidade separados: são problemas de causa diferente
          e, somados, um esconde o outro. */}
      <div className="grid grid-cols-3 divide-x divide-white/20 border-t border-white/20 bg-black/10 text-center text-white">
        <Fatia rotulo="Faltante" valor={resumo.qtFaltante} pct={resumo.pctFaltante} />
        <Fatia rotulo="Qualidade" valor={resumo.qtQualidade} pct={resumo.pctQualidade} />
        <Fatia rotulo="Aferições" valor={resumo.afericoes} pct={null} />
      </div>

      {resumo.itensSemValor.length > 0 && resumo.refugo > 0 && (
        <p className="bg-black/20 px-4 py-2 text-center text-[11px] text-white/70">
          Valor em reais indisponível: falta cadastrar o preço de {resumo.itensSemValor.length} item(ns).
        </p>
      )}
    </div>
  );
}

function Fatia({ rotulo, valor, pct }: { rotulo: string; valor: number; pct: number | null }) {
  return (
    <div className="px-2 py-3">
      <p className="text-xl font-bold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      <p className="text-[11px] uppercase tracking-wide text-white/70">{rotulo}</p>
      {pct !== null && <p className="text-[10px] text-white/50">{pct.toFixed(2)}%</p>}
    </div>
  );
}

/** Mapa a mapa. É aqui que um evento atípico aparece como evento, em vez
 *  de virar "o fulano tem 5% de refugo". */
function ListaDeAfericoes({
  afericoes,
  perfilId,
  valorPorItem,
  justificativaPorAfericao,
  de,
  ate,
  dia,
}: {
  afericoes: Afericao[];
  perfilId: string;
  valorPorItem: Map<string, number>;
  justificativaPorAfericao: Map<string, Justificativa>;
  de: string;
  ate: string;
  dia: string | null;
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-bold text-slate-900">Aferição por mapa</h2>
      <p className="mb-3 text-xs text-slate-500">
        Cada linha é um tipo de garrafa aferido num mapa seu. Onde deu refugo, você pode contar o
        que aconteceu.
      </p>
      <ul className="space-y-2">
        {afericoes.map((a) => {
          const refugo = a.qt_faltante + a.qt_qualidade;
          const pct = a.total_aferido > 0 ? (refugo / a.total_aferido) * 100 : 0;
          const preco = valorPorItem.get(a.item_codigo);
          const papel = a.motorista_colaborador_id === perfilId
            ? "motorista"
            : a.conferente_colaborador_id === perfilId
              ? "conferente"
              : "ajudante";
          const defeitos = Object.entries(a.defeitos ?? {}).sort((x, y) => y[1] - x[1]);

          return (
            <li key={a.id} className={`rounded-xl border bg-white p-3 ${refugo > 0 ? "border-amber-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {a.item_descricao ?? a.item_codigo}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {formatarData(a.data)} · mapa {a.mapa}
                    {a.placa ? ` · ${a.placa}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    você era o {papel}
                    {a.tipo_sorteio ? ` · sorteio: ${a.tipo_sorteio.toLowerCase()}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold tabular-nums ${refugo > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {pct.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {refugo.toLocaleString("pt-BR")} de {a.total_aferido.toLocaleString("pt-BR")}
                  </p>
                  {preco !== undefined && refugo > 0 && (
                    <p className="text-[11px] font-semibold text-slate-600">{formatarReais(refugo * preco)}</p>
                  )}
                </div>
              </div>

              {defeitos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  {defeitos.map(([nome, v]) => (
                    <span
                      key={nome}
                      className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                    >
                      {nome} <span className="font-bold tabular-nums">{v}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Só onde deu refugo. Numa aferição 100% boa não há o que
                  explicar, e o campo ali viraria ruído em 74% das linhas. */}
              {refugo > 0 && (
                <ExplicacaoDoRefugo
                  afericaoId={a.id}
                  justificativa={justificativaPorAfericao.get(a.id) ?? null}
                  de={de}
                  ate={ate}
                  dia={dia}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * O campo em que o colaborador conta o que aconteceu.
 *
 * Vem fechado num <details>: a maioria das aferições com refugo é de
 * poucas garrafas e não pede explicação nenhuma. Aberto por padrão, a
 * lista viraria uma parede de caixas de texto e o campo perderia o peso
 * justamente onde ele importa.
 */
function ExplicacaoDoRefugo({
  afericaoId,
  justificativa,
  de,
  ate,
  dia,
}: {
  afericaoId: string;
  justificativa: Justificativa | null;
  de: string;
  ate: string;
  dia: string | null;
}) {
  return (
    <details className="mt-2 border-t border-slate-100 pt-2" open={!justificativa ? false : true}>
      <summary className="cursor-pointer list-none text-xs font-semibold text-primary">
        {justificativa ? "✅ Sua explicação" : "🗣️ Contar o que aconteceu"}
      </summary>

      <form action={justificarRefugo} className="mt-2 space-y-2">
        <input type="hidden" name="afericao_id" value={afericaoId} />
        <input type="hidden" name="de" value={de} />
        <input type="hidden" name="ate" value={ate} />
        {dia && <input type="hidden" name="dia" value={dia} />}

        <textarea
          name="texto"
          rows={3}
          maxLength={1000}
          required
          defaultValue={justificativa?.texto ?? ""}
          placeholder="Ex.: a garrafa já veio trincada do carregamento; o cliente devolveu o vasilhame quebrado…"
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
            Enviada em {formatarData(justificativa.criado_em.slice(0, 10))}
          </p>
        )}
      </form>
    </details>
  );
}
