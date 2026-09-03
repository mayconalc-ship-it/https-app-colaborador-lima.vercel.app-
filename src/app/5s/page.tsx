import Link from "next/link";
import { redirect } from "next/navigation";
import { decodificar } from "@/lib/texto-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { OQueEh5S } from "@/components/cinco-s/OQueEh5S";
import { getContexto5S } from "@/lib/cinco-s-server";
import {
  COR_STATUS_NC,
  ROTULO_STATUS_NC,
  estaAtrasada,
  faixaDaTaxa,
  formatarTaxa,
  COR_TEXTO_FAIXA,
  type StatusNC,
  hojeISO,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/**
 * A porta do 5S para quem usa o app.
 *
 * A tela não é uma só: ela mostra o que aquela pessoa tem para FAZER.
 * Auditor vê as auditorias dele; dono de área vê o estado das áreas
 * dele; quem é os dois vê os dois blocos.
 *
 * "Para fazer" tem recorte de tempo: só o mês corrente e o que ficou
 * atrasado. Com o ciclo do ano planejado de uma vez, mostrar tudo o que
 * está em aberto encheria a tela com onze auditorias de meses que nem
 * começaram, e a deste mês -- a única acionável -- se perderia no meio.
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
        {/* Quem cai aqui é justamente quem tem curiosidade e nenhum
            caminho para matá-la. A explicação vem ABERTA nesta tela --
            fechada, ela seria só mais um aviso de porta trancada. */}
        <OQueEh5S aberto />
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
  const hoje = hojeISO();

  // As três consultas do bloco vão juntas e cada uma traz SÓ as colunas
  // que a tela desenha. Buscar a auditoria inteira para mostrar quatro
  // campos é o tipo de desperdício que não aparece com dez linhas e
  // aparece muito com dez mil.
  // O mês corrente, no formato da coluna `competencia` do banco.
  const mesAtual = `${hoje.slice(0, 7)}-01`;

  const [
    { data: pendentes },
    { data: feitas },
    { data: minhasAcoes },
    { data: areasDoDono },
  ] = await Promise.all([
    // O QUE FAZER AGORA. Com o ano inteiro planejado, listar tudo o que
    // está em aberto mostraria doze auditorias de uma vez -- e onze
    // delas são de meses que ainda nem começaram. O corte é
    // `competencia <= mês atual`: entra o mês corrente e entra o que
    // ficou para trás.
    //
    // O atrasado continua aparecendo de propósito. Sumir com a
    // auditoria de julho quando agosto começa é o jeito mais rápido de
    // ela nunca ser feita -- e ela é justamente a que mais precisa
    // estar na frente da pessoa.
    ctx.ehAuditor || ctx.gestor
      ? admin
          .from("cinco_s_auditorias")
          .select(
            "id, status, planejada_para, conformidade, total_nok, cinco_s_areas!inner(nome)",
          )
          .eq("revenda_id", ctx.revendaId)
          .eq("auditor_id", ctx.perfilId)
          .in("status", ["planejada", "em_andamento"])
          .lte("competencia", mesAtual)
          .order("planejada_para")
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),

    // O histórico fica em consulta própria. Junto com as pendentes numa
    // só, o `limit` seria consumido pelas auditorias futuras e o que já
    // foi feito não caberia na lista.
    ctx.ehAuditor || ctx.gestor
      ? admin
          .from("cinco_s_auditorias")
          .select(
            "id, status, planejada_para, conformidade, total_nok, cinco_s_areas!inner(nome)",
          )
          .eq("revenda_id", ctx.revendaId)
          .eq("auditor_id", ctx.perfilId)
          .eq("status", "finalizada")
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

  const listaPendentes = pendentes ?? [];
  const listaFeitas = feitas ?? [];
  const atrasadas = listaPendentes.filter(
    (a) => a.planejada_para < hoje,
  ).length;

  // As ações vencidas ganham o mesmo tratamento das auditorias: o que
  // passou do prazo precisa ser visível antes de qualquer outra coisa.
  const acoesAtrasadas = (minhasAcoes ?? []).filter((n) =>
    estaAtrasada(n.prazo, n.status as StatusNC),
  ).length;

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

      {/* A faixa só existe quando há atraso. Aviso permanente vira
          papel de parede -- deixa de ser lido no segundo dia. */}
      {(atrasadas > 0 || acoesAtrasadas > 0) && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-3">
          <span className="text-2xl leading-none" aria-hidden="true">
            ⚠️
          </span>
          <p className="min-w-0 flex-1 text-sm text-red-900">
            <strong className="font-bold">Você tem coisa vencida.</strong>{" "}
            {[
              atrasadas > 0 &&
                `${atrasadas} auditoria${atrasadas === 1 ? "" : "s"}`,
              acoesAtrasadas > 0 &&
                `${acoesAtrasadas} ${acoesAtrasadas === 1 ? "ação" : "ações"} do plano`,
            ]
              .filter(Boolean)
              .join(" e ")}{" "}
            {atrasadas + acoesAtrasadas === 1 ? "passou" : "passaram"} do prazo.
          </p>
        </div>
      )}

      <OQueEh5S />

      {/* BI e plano de ação para QUEM PARTICIPA, não só para a gestão:
          quem audita e quem responde por uma área precisam ver onde a
          operação está.

          Sem atalho para o painel de gestão, mesmo para quem tem acesso
          a ele -- administrar o programa é papel de quem o Admin
          indicar, e a porta disso é o Modo Liderança. Um "Gerenciar"
          aqui misturaria as duas coisas na tela de quem vem auditar. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Atalho href="/5s/bi" emoji="📊" titulo="BI 5S" />
        <Atalho href="/5s/acoes" emoji="🛠️" titulo="Plano de ação" />
      </div>

      {/* ---- O que eu preciso auditar ----

          É o bloco mais importante da tela e por isso ele grita: cartão
          cheio de cor, não borda fina. A atrasada é vermelha e diz há
          quantos dias venceu -- "atrasada" sozinho não move ninguém,
          "12 dias de atraso" move.

          Vem ANTES do resto porque quem abre o 5S abre para fazer a
          auditoria, não para olhar gráfico. */}
      {listaPendentes.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Para auditar
            {atrasadas > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold normal-case tracking-normal text-white">
                {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <ul className="space-y-2.5">
            {listaPendentes.map((a) => {
              const atrasada = a.planejada_para < hoje;
              const dias = diasDeAtraso(a.planejada_para, hoje);
              const area = umObjeto(a.cinco_s_areas) as { nome: string };
              return (
                <li key={a.id}>
                  <Link
                    href={`/5s/auditoria/${a.id}`}
                    className={`block rounded-2xl p-4 shadow-sm active:brightness-95 ${
                      atrasada
                        ? "bg-red-600 text-white"
                        : "border-2 border-primary bg-primary-soft"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold uppercase tracking-wide ${
                            atrasada ? "text-red-100" : "text-primary"
                          }`}
                        >
                          {atrasada
                            ? `⚠️ ${dias} dia${dias === 1 ? "" : "s"} de atraso`
                            : a.status === "em_andamento"
                              ? "▶ Iniciada"
                              : "Prevista para " +
                                a.planejada_para.split("-").reverse().slice(0, 2).join("/")}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-lg font-bold leading-tight ${
                            atrasada ? "text-white" : "text-slate-900"
                          }`}
                        >
                          {area.nome}
                        </p>
                        <p
                          className={`mt-0.5 text-xs ${
                            atrasada ? "text-red-100" : "text-slate-500"
                          }`}
                        >
                          {a.status === "em_andamento"
                            ? "Continue de onde parou"
                            : "25 itens · uns 10 minutos"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
                          atrasada
                            ? "bg-white text-red-700"
                            : "bg-primary text-white"
                        }`}
                      >
                        {a.status === "em_andamento" ? "Continuar" : "Auditar"}
                      </span>
                    </div>
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
                    className={`block rounded-2xl border-2 p-4 shadow-sm active:brightness-95 ${
                      atrasada
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {atrasada && n.prazo && (
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-700">
                        ⚠️ {diasDeAtraso(n.prazo, hoje)} dia
                        {diasDeAtraso(n.prazo, hoje) === 1 ? "" : "s"} de atraso
                      </p>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`min-w-0 flex-1 text-sm ${
                          atrasada
                            ? "font-medium text-red-900"
                            : "text-slate-700"
                        }`}
                      >
                        {n.descricao}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_STATUS_NC[n.status as StatusNC]}`}
                      >
                        {ROTULO_STATUS_NC[n.status as StatusNC]}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-xs ${atrasada ? "text-red-700" : "text-slate-400"}`}
                    >
                      {area.nome}
                      {n.prazo && (
                        <span className={atrasada ? "font-semibold" : ""}>
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
      {listaFeitas.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Auditorias que você fez
              <span className="ml-2 font-normal text-slate-400">
                ({listaFeitas.length})
              </span>
            </h2>
            <span className="text-slate-400 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {listaFeitas.map((a) => {
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

  const hoje = hojeISO();

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
                    {abertas.total} {abertas.total === 1 ? "ação" : "ações"} em aberto
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

function Atalho({
  href,
  emoji,
  titulo,
}: {
  href: string;
  emoji: string;
  titulo: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm active:bg-slate-50"
    >
      <p className="text-2xl">{emoji}</p>
      <p className="mt-1 text-sm font-semibold leading-tight text-slate-700">
        {titulo}
      </p>
    </Link>
  );
}

/** Dias inteiros entre a data prevista e hoje. Nunca negativo. */
function diasDeAtraso(planejada: string, hoje: string) {
  const [a1, m1, d1] = planejada.split("-").map(Number);
  const [a2, m2, d2] = hoje.split("-").map(Number);
  const prevista = Date.UTC(a1, m1 - 1, d1);
  const agora = Date.UTC(a2, m2 - 1, d2);
  return Math.max(0, Math.round((agora - prevista) / 86_400_000));
}

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
