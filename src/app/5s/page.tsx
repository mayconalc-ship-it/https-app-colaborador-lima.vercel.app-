import Link from "next/link";
import { redirect } from "next/navigation";
import { decodificar } from "@/lib/texto-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { getContexto5S } from "@/lib/cinco-s-server";
import {
  COR_STATUS_NC,
  ROTULO_STATUS_NC,
  estaAtrasada,
  faixaDaTaxa,
  formatarTaxa,
  COR_TEXTO_FAIXA,
  type StatusNC,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/**
 * A porta do 5S para quem usa o app.
 *
 * A tela não é uma só: ela mostra o que aquela pessoa tem para FAZER.
 * Auditor vê as auditorias dele; dono de área vê o estado das áreas
 * dele; quem é os dois vê os dois blocos. Gestor tem, além disso, o
 * atalho para o painel e o BI.
 *
 * Nenhum bloco carrega o que não vai exibir: quem não é dono de área
 * nenhuma não dispara a consulta de áreas.
 */
export default async function CincoSPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const ctx = await getContexto5S();
  if (!ctx) redirect("/");

  const { erro } = await searchParams;

  if (!ctx.temAcesso) {
    return (
      <div>
        <PageHeader title="🧹 Programa 5S" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            Você ainda não participa do Programa 5S.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            O acesso é liberado para auditores e donos de área. Fale com o
            Admin do app.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  // As três consultas do bloco vão juntas e cada uma traz SÓ as colunas
  // que a tela desenha. Buscar a auditoria inteira para mostrar quatro
  // campos é o tipo de desperdício que não aparece com dez linhas e
  // aparece muito com dez mil.
  const [
    { data: minhasAuditorias },
    { data: minhasAcoes },
    { data: areasDoDono },
  ] = await Promise.all([
    ctx.ehAuditor || ctx.gestor
      ? admin
          .from("cinco_s_auditorias")
          .select(
            "id, status, planejada_para, conformidade, total_nok, cinco_s_areas!inner(nome)",
          )
          .eq("revenda_id", ctx.revendaId)
          .eq("auditor_id", ctx.perfilId)
          .neq("status", "cancelada")
          .order("planejada_para", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),

    admin
      .from("cinco_s_nao_conformidades")
      .select("id, descricao, status, prazo, prioridade, cinco_s_areas!inner(nome)")
      .eq("revenda_id", ctx.revendaId)
      .eq("responsavel_id", ctx.perfilId)
      .in("status", ["aberta", "em_andamento"])
      .order("prazo", { nullsFirst: false })
      .limit(10),

    ctx.areasComoDono.length > 0
      ? admin
          .from("cinco_s_auditorias")
          .select("id, area_id, status, planejada_para, conformidade, total_nok")
          .in("area_id", ctx.areasComoDono)
          .neq("status", "cancelada")
          .order("planejada_para", { ascending: false })
          .limit(120)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const pendentes = (minhasAuditorias ?? []).filter(
    (a) => a.status === "planejada" || a.status === "em_andamento",
  );
  const feitas = (minhasAuditorias ?? []).filter(
    (a) => a.status === "finalizada",
  );

  return (
    <div>
      <PageHeader
        title="🧹 Programa 5S"
        subtitle={papelEmTexto(ctx)}
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}

      {ctx.gestor && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Link
            href="/admin/5s/bi"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm active:bg-slate-50"
          >
            <p className="text-2xl">📊</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">BI 5S</p>
          </Link>
          <Link
            href="/admin/5s"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm active:bg-slate-50"
          >
            <p className="text-2xl">⚙️</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              Gerenciar
            </p>
          </Link>
        </div>
      )}

      {/* ---- O que eu preciso auditar ---- */}
      {pendentes.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Suas auditorias
          </h2>
          <ul className="space-y-2">
            {pendentes.map((a) => {
              const atrasada = a.planejada_para < hoje;
              const area = umObjeto(a.cinco_s_areas) as { nome: string };
              return (
                <li key={a.id}>
                  <Link
                    href={`/5s/auditoria/${a.id}`}
                    className={`flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm active:bg-slate-50 ${
                      atrasada ? "border-red-200" : "border-slate-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {area.nome}
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.status === "em_andamento"
                          ? "Começada — continue de onde parou"
                          : `Prevista para ${a.planejada_para.split("-").reverse().join("/")}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                        atrasada
                          ? "bg-red-600 text-white"
                          : "bg-primary text-white"
                      }`}
                    >
                      {atrasada ? "Atrasada" : "Auditar"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Minhas áreas (dono) ---- */}
      {ctx.areasComoDono.length > 0 && (
        <MinhasAreas
          areaIds={ctx.areasComoDono}
          auditorias={(areasDoDono ?? []) as AuditoriaLinha[]}
          revendaId={ctx.revendaId}
        />
      )}

      {/* ---- Ações que caíram no meu colo ---- */}
      <section className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Suas ações
          </h2>
          <Link href="/5s/acoes" className="text-xs font-semibold text-primary underline">
            Ver todas
          </Link>
        </div>
        {(minhasAcoes ?? []).length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
            Nenhuma ação em aberto para você. 👏
          </div>
        ) : (
          <ul className="space-y-2">
            {(minhasAcoes ?? []).map((n) => {
              const atrasada = estaAtrasada(n.prazo, n.status as StatusNC);
              const area = umObjeto(n.cinco_s_areas) as { nome: string };
              return (
                <li key={n.id}>
                  <Link
                    href={`/5s/acoes?foco=${n.id}`}
                    className={`block rounded-2xl border bg-white p-4 shadow-sm active:bg-slate-50 ${
                      atrasada ? "border-red-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm text-slate-700">
                        {n.descricao}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_STATUS_NC[n.status as StatusNC]}`}
                      >
                        {ROTULO_STATUS_NC[n.status as StatusNC]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {area.nome}
                      {n.prazo && (
                        <span className={atrasada ? "font-semibold text-red-600" : ""}>
                          {" · "}
                          {atrasada ? "venceu em " : "até "}
                          {n.prazo.split("-").reverse().join("/")}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Histórico do auditor ---- */}
      {feitas.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Auditorias que você fez
              <span className="ml-2 font-normal text-slate-400">
                ({feitas.length})
              </span>
            </h2>
            <span className="text-slate-400 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {feitas.map((a) => {
              const area = umObjeto(a.cinco_s_areas) as { nome: string };
              const faixa = faixaDaTaxa(a.conformidade);
              return (
                <li key={a.id}>
                  <Link
                    href={`/5s/auditoria/${a.id}`}
                    className="flex items-center justify-between gap-3 p-3 active:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">
                        {area.nome}
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.planejada_para.split("-").reverse().join("/")}
                        {a.total_nok > 0 && ` · ${a.total_nok} NOK`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${COR_TEXTO_FAIXA[faixa]}`}
                    >
                      {formatarTaxa(a.conformidade)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type AuditoriaLinha = {
  id: string;
  area_id: string;
  status: string;
  planejada_para: string;
  conformidade: number | null;
  total_nok: number;
};

/**
 * O painel do dono da área.
 *
 * Uma linha por área com a última nota, a tendência e o que está em
 * aberto -- que é exatamente a conversa que ele tem com o auditor. As
 * auditorias já vieram na consulta da página; aqui é só recorte em
 * memória, sem ida nova ao banco.
 */
async function MinhasAreas({
  areaIds,
  auditorias,
  revendaId,
}: {
  areaIds: string[];
  auditorias: AuditoriaLinha[];
  revendaId: string;
}) {
  const admin = createAdminClient();

  const [{ data: areas }, { data: ncs }] = await Promise.all([
    admin
      .from("cinco_s_areas")
      .select("id, nome")
      .in("id", areaIds)
      .eq("revenda_id", revendaId)
      .order("nome"),
    admin
      .from("cinco_s_nao_conformidades")
      .select("area_id, status, prazo")
      .in("area_id", areaIds)
      .in("status", ["aberta", "em_andamento"]),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);

  const porArea = new Map<
    string,
    { ultima?: AuditoriaLinha; anterior?: AuditoriaLinha; proxima?: AuditoriaLinha }
  >();

  // A lista já vem ordenada da mais nova para a mais velha, então a
  // primeira finalizada de cada área é a última auditoria dela.
  for (const a of auditorias) {
    const atual = porArea.get(a.area_id) ?? {};
    if (a.status === "finalizada") {
      if (!atual.ultima) atual.ultima = a;
      else if (!atual.anterior) atual.anterior = a;
    } else if (!atual.proxima) {
      atual.proxima = a;
    }
    porArea.set(a.area_id, atual);
  }

  const abertasPorArea = new Map<string, { total: number; atrasadas: number }>();
  for (const n of ncs ?? []) {
    const atual = abertasPorArea.get(n.area_id) ?? { total: 0, atrasadas: 0 };
    atual.total++;
    if (n.prazo && n.prazo < hoje) atual.atrasadas++;
    abertasPorArea.set(n.area_id, atual);
  }

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Suas áreas
      </h2>
      <ul className="space-y-2">
        {(areas ?? []).map((area) => {
          const d = porArea.get(area.id) ?? {};
          const faixa = faixaDaTaxa(d.ultima?.conformidade);
          const abertas = abertasPorArea.get(area.id);

          const delta =
            d.ultima?.conformidade != null && d.anterior?.conformidade != null
              ? Math.round(
                  (d.ultima.conformidade - d.anterior.conformidade) * 10,
                ) / 10
              : null;

          return (
            <li
              key={area.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {area.nome}
                </p>
                <span
                  className={`shrink-0 text-lg font-bold tabular-nums ${COR_TEXTO_FAIXA[faixa]}`}
                >
                  {formatarTaxa(d.ultima?.conformidade)}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-slate-400">
                {d.ultima ? (
                  <>
                    Última auditoria em{" "}
                    {d.ultima.planejada_para.split("-").reverse().join("/")}
                    {delta !== null && delta !== 0 && (
                      <span
                        className={
                          delta > 0
                            ? "font-semibold text-green-600"
                            : "font-semibold text-red-600"
                        }
                      >
                        {" · "}
                        {delta > 0 ? "▲" : "▼"}{" "}
                        {Math.abs(delta).toFixed(1).replace(".", ",")} p.p.
                      </span>
                    )}
                  </>
                ) : (
                  "Ainda não auditada"
                )}
              </p>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {abertas && abertas.total > 0 ? (
                  <Link
                    href={`/5s/acoes?area=${area.id}`}
                    className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-amber-200"
                  >
                    {abertas.total} ação{abertas.total === 1 ? "" : "ões"} em aberto
                    {abertas.atrasadas > 0 && ` · ${abertas.atrasadas} atrasada${abertas.atrasadas === 1 ? "" : "s"}`}
                  </Link>
                ) : (
                  <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-700 ring-1 ring-green-200">
                    Sem ações pendentes
                  </span>
                )}
                {d.proxima && (
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">
                    Próxima:{" "}
                    {d.proxima.planejada_para.split("-").reverse().join("/")}
                  </span>
                )}
                {d.ultima && (
                  <Link
                    href={`/5s/auditoria/${d.ultima.id}`}
                    className="rounded-full bg-white px-2.5 py-1 font-semibold text-primary ring-1 ring-slate-200"
                  >
                    Ver resultado
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** O PostgREST devolve o relacionamento como objeto ou lista. */
function umObjeto(valor: unknown) {
  return Array.isArray(valor) ? valor[0] : valor;
}

function papelEmTexto(ctx: {
  gestor: boolean;
  ehAuditor: boolean;
  areasComoDono: string[];
}) {
  const papeis: string[] = [];
  if (ctx.gestor) papeis.push("gestão do programa");
  if (ctx.ehAuditor) papeis.push("auditor");
  if (ctx.areasComoDono.length > 0) {
    papeis.push(
      `dono de ${ctx.areasComoDono.length} área${ctx.areasComoDono.length === 1 ? "" : "s"}`,
    );
  }
  if (papeis.length === 0) return undefined;
  return papeis.join(" · ");
}
