import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import { formatarData, hojeISO } from "@/lib/produtividade-armazem";
import { diasAntes, diasNoIntervalo } from "@/lib/rating";
import { META_PADRAO_PCT, pctDoDia, precisaJustificar } from "@/lib/devolucao";
import { alertaDaAfericao } from "@/lib/refugo";
import {
  EMOJI_INDICADOR,
  INDICADORES,
  ROTULO_INDICADOR,
  contarPorIndicador,
  contarPorPessoa,
  ehIndicador,
  ordenarPorFato,
  type Justificativa,
} from "@/lib/justificativas";

export const dynamic = "force-dynamic";

const MAXIMO_DE_DIAS = 92;

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * As explicações dos três indicadores num lugar só.
 *
 * Lê com o cliente de serviço de propósito: o RLS de cada tabela é
 * "colaborador_id = auth.uid()", que é o certo para a tela do colaborador
 * e impediria a liderança de ler qualquer coisa aqui. A trava desta tela
 * é a permissão do módulo, na linha abaixo -- não o RLS.
 */
export default async function AdminJustificativasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; indicador?: string; busca?: string }>;
}) {
  await requireModulo("justificativas", "ver");

  const sp = await searchParams;
  const hoje = hojeISO();
  let de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : diasAntes(hoje, 29);
  let ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : hoje;
  if (ate < de) [de, ate] = [ate, de];
  if (diasNoIntervalo(de, ate) > MAXIMO_DE_DIAS) de = diasAntes(ate, MAXIMO_DE_DIAS - 1);

  const filtroIndicador = ehIndicador(sp.indicador) ? sp.indicador : null;
  const busca = (sp.busca ?? "").trim();

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return (
      <div>
        <PageHeader title="🗣️ Justificativas" subtitle="Você não está em nenhuma revenda." />
      </div>
    );
  }

  const admin = createAdminClient();
  const quer = (i: string) => !filtroIndicador || filtroIndicador === i;

  // Cada indicador guarda a explicação com a sua própria chave, então são
  // três leituras mesmo -- e cada uma traz o fato junto, para a lista não
  // virar desabafo sem contexto.
  const [rating, devolucao, refugo, config] = await Promise.all([
    quer("rating")
      ? admin
          .from("rating_feedbacks")
          .select(
            "id, colaborador_id, colaborador_nome, papel, texto, criado_em, rating_avaliacoes!inner(data_avaliacao, nota, classificacao, nome_pdv, cidade, mapa, motivo)",
          )
          .eq("revenda_id", revendaId)
          .gte("rating_avaliacoes.data_avaliacao", de)
          .lte("rating_avaliacoes.data_avaliacao", ate)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),

    quer("devolucao")
      ? admin
          .from("devolucao_justificativas")
          .select("id, data, colaborador_id, colaborador_nome, papel, texto, criado_em")
          .eq("revenda_id", revendaId)
          .gte("data", de)
          .lte("data", ate)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),

    quer("refugo")
      ? admin
          .from("refugo_justificativas")
          .select(
            "id, colaborador_id, colaborador_nome, papel, texto, criado_em, refugo_afericoes!inner(data, mapa, item_descricao, item_codigo, total_aferido, qt_faltante, qt_qualidade)",
          )
          .eq("revenda_id", revendaId)
          .gte("refugo_afericoes.data", de)
          .lte("refugo_afericoes.data", ate)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),

    admin.from("devolucao_config").select("meta_pct").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  const meta = Number(config.data?.meta_pct ?? META_PADRAO_PCT);

  // O % do dia não está gravado: é calculado. Busco os dias citados para
  // marcar quais passaram da meta.
  const diasCitados = [...new Set(((devolucao.data ?? []) as Record<string, unknown>[]).map((d) => d.data as string))];
  const { data: diasBanco } = diasCitados.length
    ? await admin
        .from("devolucao_dia")
        .select("data, motorista_colaborador_id, valor_entregue, valor_devolvido, valor_fora_do_indicador")
        .eq("revenda_id", revendaId)
        .in("data", diasCitados)
    : { data: [] as Record<string, unknown>[] };

  const pctPorDiaPessoa = new Map<string, number | null>();
  for (const d of (diasBanco ?? []) as Record<string, unknown>[]) {
    pctPorDiaPessoa.set(
      `${d.data as string}|${(d.motorista_colaborador_id as string) ?? ""}`,
      pctDoDia(
        Number(d.valor_entregue),
        Number(d.valor_devolvido),
        Number(d.valor_fora_do_indicador),
      ),
    );
  }

  // O PostgREST devolve o relacionamento como objeto ou como array
  // conforme a cardinalidade que ele infere. Aqui é sempre um só.
  const um = (v: unknown): Record<string, unknown> | null =>
    Array.isArray(v) ? (v[0] as Record<string, unknown>) ?? null : (v as Record<string, unknown> | null);

  const todas: Justificativa[] = [
    ...((rating.data ?? []) as Record<string, unknown>[]).map((f) => {
      const a = um(f.rating_avaliacoes as Record<string, unknown>);
      const nota = Number(a?.nota ?? 0);
      return {
        id: `rating-${f.id as string}`,
        indicador: "rating" as const,
        data: (a?.data_avaliacao as string) ?? "",
        colaboradorId: f.colaborador_id as string,
        colaboradorNome: f.colaborador_nome as string,
        papel: f.papel as string,
        texto: f.texto as string,
        criadoEm: f.criado_em as string,
        contexto: `${"★".repeat(nota)}${"☆".repeat(5 - nota)} · ${a?.nome_pdv ?? "PDV não identificado"}${
          a?.cidade ? ` · ${a.cidade}` : ""
        } · mapa ${a?.mapa ?? "—"}${a?.motivo ? ` · ${a.motivo}` : ""}`,
        grave: a?.classificacao === "detrator",
      };
    }),

    ...((devolucao.data ?? []) as Record<string, unknown>[]).map((d) => {
      const pct = pctPorDiaPessoa.get(`${d.data as string}|${d.colaborador_id as string}`) ?? null;
      return {
        id: `devolucao-${d.id as string}`,
        indicador: "devolucao" as const,
        data: d.data as string,
        colaboradorId: d.colaborador_id as string,
        colaboradorNome: d.colaborador_nome as string,
        papel: d.papel as string,
        texto: d.texto as string,
        criadoEm: d.criado_em as string,
        contexto:
          pct === null
            ? `dia inteiro · meta ${meta}%`
            : `${pct.toFixed(2)}% de devolução · meta ${meta}%`,
        grave: precisaJustificar(pct, meta),
      };
    }),

    ...((refugo.data ?? []) as Record<string, unknown>[]).map((r) => {
      const a = um(r.refugo_afericoes as Record<string, unknown>);
      const total = Number(a?.total_aferido ?? 0);
      const perdido = Number(a?.qt_faltante ?? 0) + Number(a?.qt_qualidade ?? 0);
      const pct = total > 0 ? (perdido / total) * 100 : 0;
      return {
        id: `refugo-${r.id as string}`,
        indicador: "refugo" as const,
        data: (a?.data as string) ?? "",
        colaboradorId: r.colaborador_id as string,
        colaboradorNome: r.colaborador_nome as string,
        papel: r.papel as string,
        texto: r.texto as string,
        criadoEm: r.criado_em as string,
        contexto: `${perdido} de ${total} (${pct.toFixed(2)}%) · ${
          a?.item_descricao ?? a?.item_codigo ?? "item"
        } · mapa ${a?.mapa ?? "—"}`,
        grave: alertaDaAfericao(total, perdido) !== null,
      };
    }),
  ];

  const semBusca = ordenarPorFato(todas);
  const alvo = busca.toLowerCase();
  const lista = busca
    ? semBusca.filter(
        (j) => j.colaboradorNome.toLowerCase().includes(alvo) || j.texto.toLowerCase().includes(alvo),
      )
    : semBusca;

  const porIndicador = contarPorIndicador(lista);
  const porPessoa = contarPorPessoa(lista);
  const graves = lista.filter((j) => j.grave).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="🗣️ Justificativas"
        subtitle="O que os colaboradores explicaram no Rating, na Devolução e no Refugo."
      />

      <form method="get" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="min-w-0">
          <label className={rotulo} htmlFor="de">De</label>
          <input id="de" type="date" name="de" defaultValue={de} className={campo} />
        </div>
        <div className="min-w-0">
          <label className={rotulo} htmlFor="ate">Até</label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[9rem]">
          <label className={rotulo} htmlFor="indicador">Indicador</label>
          <select id="indicador" name="indicador" defaultValue={filtroIndicador ?? ""} className={campo}>
            <option value="">Todos</option>
            {INDICADORES.map((i) => (
              <option key={i} value={i}>{ROTULO_INDICADOR[i]}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:flex-1">
          <label className={rotulo} htmlFor="busca">Buscar</label>
          <input
            id="busca"
            name="busca"
            defaultValue={busca}
            placeholder="Nome da pessoa ou palavra no texto"
            className={campo}
          />
        </div>
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white sm:col-span-1"
        >
          Filtrar
        </button>
      </form>

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao titulo="Explicações" valor={String(lista.length)} legenda={`${diasNoIntervalo(de, ate)} dias`} />
        <Cartao
          titulo="Casos graves"
          valor={String(graves)}
          legenda="detrator, acima da meta ou destoante"
          alerta={graves > 0}
        />
        <Cartao titulo="Pessoas" valor={String(porPessoa.length)} legenda="que escreveram" />
        <Cartao
          titulo="Por indicador"
          valor={`${porIndicador.rating}·${porIndicador.devolucao}·${porIndicador.refugo}`}
          legenda="⭐ · ↩️ · ♻️"
        />
      </div>

      {porPessoa.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
            👤 Quem escreveu ({porPessoa.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {porPessoa.map((p) => (
              <li key={p.nome} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 truncate text-slate-700">{p.nome}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {p.total} explicaç{p.total === 1 ? "ão" : "ões"}
                  {p.graves > 0 && <span className="ml-1 font-bold text-amber-700">({p.graves} grave{p.graves > 1 ? "s" : ""})</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-500">Nenhuma explicação no período</p>
          <p className="mt-1 text-xs text-slate-400">
            O campo aparece para o colaborador quando a nota fica abaixo de 5 estrelas, quando o dia
            passa da meta de devolução, ou quando a aferição dele deu refugo.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((j) => (
            <li
              key={j.id}
              className={`min-w-0 rounded-2xl border bg-white p-3 ${
                j.grave ? "border-amber-300" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{j.colaboradorNome}</p>
                  <p className="text-xs text-slate-500">
                    {formatarData(j.data)} · {j.papel}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
                    j.grave ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {EMOJI_INDICADOR[j.indicador]} {ROTULO_INDICADOR[j.indicador]}
                </span>
              </div>

              <p className="mt-1 break-words text-[11px] text-slate-500">{j.contexto}</p>

              <p className="mt-2 border-l-2 border-slate-300 pl-2 text-sm italic text-slate-700">
                “{j.texto}”
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        💡 Estas explicações são o outro lado do número. Boa parte da devolução, da nota baixa e do
        refugo não é de quem entrega — é aqui que isso aparece, com nome e data, para virar
        tratativa em vez de cobrança.
      </p>

      <Link href="/admin" className="block text-center text-sm font-semibold text-primary hover:underline">
        ← Voltar ao painel
      </Link>
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  legenda,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 shadow-sm ${
        alerta ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase leading-tight text-slate-500">{titulo}</p>
      <p className={`mt-1 break-words text-xl font-extrabold ${alerta ? "text-amber-800" : "text-slate-900"}`}>
        {valor}
      </p>
      {legenda && <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{legenda}</p>}
    </div>
  );
}
