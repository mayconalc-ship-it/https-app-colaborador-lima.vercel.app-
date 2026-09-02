import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import {
  getCompetencias,
  getContexto5S,
  getDashboard,
  listarAreas,
  nomesDe,
} from "@/lib/cinco-s-server";
import {
  Bloco,
  BarrasPorArea,
  Cartao,
  LinhaEvolucao,
  RadarSensos,
  RankingPerguntas,
} from "@/components/cinco-s/Graficos";
import {
  ROTULO_SENSO,
  SENSOS,
  competenciaAtual,
  ehCompetencia,
  ehSenso,
  faixaDaTaxa,
  formatarTaxa,
  rotuloCompetencia,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

type Params = {
  mes?: string;
  area?: string;
  auditor?: string;
  dono?: string;
  senso?: string;
};

/**
 * BI 5S.
 *
 * A tela inteira sai de TRÊS consultas ao banco: o dashboard (uma
 * chamada que devolve os sete cartões, os quatro gráficos e as duas
 * listas), a lista de meses e a lista de áreas para o filtro. O desenho
 * ingênuo faria quinze -- uma por bloco, cada uma refiltrando a mesma
 * base.
 *
 * Nenhuma delas varre respostas de auditoria: os totais já foram
 * somados na finalização (ver migração 035). É isso que faz a tela
 * continuar abrindo rápido depois de mil auditorias.
 *
 * Filtro é link, não JavaScript. Trocar de mês navega, o servidor
 * responde com o HTML pronto e o Next mantém a rolagem -- sem estado de
 * cliente, sem "carregando" piscando em cada bloco, sem pacote de
 * gráfico para baixar.
 */
export default async function BI5SPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  // Aberto a QUEM PARTICIPA do programa, não só à gestão: auditor e
  // dono de área veem o mesmo painel. Um programa de 5S em que só o
  // administrador enxerga o resultado vira relatório de gabinete --
  // quem faz a auditoria e quem responde pela área precisam saber onde
  // a operação está para que o número signifique alguma coisa.
  //
  // Continua sendo leitura: cadastrar, planejar e validar seguem
  // exigindo "5s:editar", e essas telas ficam no Modo Liderança.
  const ctx = await getContexto5S();
  if (!ctx) redirect("/");
  if (!ctx.temAcesso) {
    redirect(
      `/5s?erro=${encodeURIComponent(
        "Você ainda não participa do Programa 5S.",
      )}`,
    );
  }
  const revendaId = ctx.revendaId;

  const p = await searchParams;

  // "todos" é uma escolha explícita; ausência de parâmetro cai no mês
  // corrente. Abrir no acumulado histórico responderia a pergunta
  // errada: a gestão do 5S é mensal.
  const mes =
    p.mes === "todos" ? null : ehCompetencia(p.mes) ? p.mes : competenciaAtual();
  const areaId = p.area || null;
  const auditorId = p.auditor || null;
  const donoId = p.dono || null;
  const senso = ehSenso(p.senso) ? p.senso : null;

  const [dados, competencias, areas] = await Promise.all([
    getDashboard(revendaId, {
      competencia: mes,
      areaId,
      auditorId,
      donoId,
      senso,
    }),
    getCompetencias(revendaId),
    listarAreas(revendaId),
  ]);

  const { cartoes } = dados;

  const donos = areas.filter((a) => a.dono_id);
  const nomesDono = await nomesDe(
    Array.from(new Set(donos.map((d) => d.dono_id!))),
  );

  /** Mantém os outros filtros ao trocar um deles. */
  const url = (mudanca: Partial<Params>) => {
    const q = new URLSearchParams();
    const final: Params = {
      mes: mes ?? "todos",
      area: areaId ?? "",
      auditor: auditorId ?? "",
      dono: donoId ?? "",
      senso: senso ?? "",
      ...mudanca,
    };
    for (const [k, v] of Object.entries(final)) {
      if (v && !(k === "mes" && v === competenciaAtual())) q.set(k, v);
    }
    const s = q.toString();
    return s ? `/5s/bi?${s}` : "/5s/bi";
  };

  const areaAtual = areas.find((a) => a.id === areaId);
  const temFiltro = Boolean(areaId || auditorId || donoId || senso);

  // O senso mais crítico do recorte. É o que responde, no topo da tela,
  // "qual senso está mais crítico?" sem obrigar a ler o radar.
  const piorSenso = [...dados.por_senso]
    .filter((s) => s.conformidade !== null)
    .sort((a, b) => (a.conformidade ?? 0) - (b.conformidade ?? 0))[0];

  const piorArea = [...dados.por_area]
    .filter((a) => a.conformidade !== null)
    .sort((a, b) => (a.conformidade ?? 0) - (b.conformidade ?? 0))[0];

  /**
   * Duas planilhas, porque são duas perguntas diferentes: "qual área está
   * pior" e "qual item reprova mais". Uma só, com as duas coisas
   * empilhadas, não serviria para nenhuma das duas -- planilha se usa com
   * tabela dinâmica, e tabela dinâmica precisa de uma linha por entidade.
   *
   * Ambas saem do recorte que está na tela: mês, área, auditor, dono e
   * senso já filtraram `dados`.
   */
  const csvAreas = dados.por_area.map((a) => [
    a.area,
    a.conformidade,
    a.auditorias,
    a.itens,
    a.nok,
    a.nc_abertas,
  ]);

  const csvPerguntas = dados.perguntas.map((q) => [
    q.codigo,
    ROTULO_SENSO[q.senso],
    q.texto,
    q.ok,
    q.nok,
    q.na,
    q.taxa_nok,
  ]);

  return (
    <div>
      <PageHeader
        title="BI 5S"
        subtitle={
          mes ? rotuloCompetencia(mes) : "Todo o histórico"
        }
        fecharHref="/5s"
      />

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <ExportarCsv
          nome="5s-por-area"
          complemento={mes ?? "todo-o-periodo"}
          cabecalho={[
            "Área",
            "Conformidade (%)",
            "Auditorias",
            "Itens avaliados",
            "Itens NOK",
            "Não conformidades abertas",
          ]}
          linhas={csvAreas}
          rotulo="Áreas .csv"
        />
        <ExportarCsv
          nome="5s-por-pergunta"
          complemento={mes ?? "todo-o-periodo"}
          cabecalho={[
            "Código",
            "Senso",
            "Pergunta",
            "OK",
            "NOK",
            "N/A",
            "Taxa de NOK (%)",
          ]}
          linhas={csvPerguntas}
          rotulo="Perguntas .csv"
        />
      </div>

      {/* ---- Filtros ---- */}
      <div className="rolagem-lateral -mx-4 mb-4 overflow-x-auto px-4 pb-2">
        <div className="flex w-max gap-2">
          <Link
            href={url({ mes: "todos" })}
            className={pilula(mes === null, "escuro")}
          >
            Todo o período
          </Link>
          {competencias.slice(0, 18).map((c) => (
            <Link key={c} href={url({ mes: c })} className={pilula(mes === c)}>
              {rotuloCompetencia(c).replace(" de ", "/")}
            </Link>
          ))}
        </div>
      </div>

      {temFiltro && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary-soft p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            Filtrado por
          </span>
          {areaAtual && <Etiqueta href={url({ area: "" })}>{areaAtual.nome}</Etiqueta>}
          {senso && (
            <Etiqueta href={url({ senso: "" })}>
              Senso: {ROTULO_SENSO[senso]}
            </Etiqueta>
          )}
          {auditorId && (
            <Etiqueta href={url({ auditor: "" })}>
              Auditor:{" "}
              {dados.por_auditor.find((a) => a.auditor_id === auditorId)?.nome ??
                "selecionado"}
            </Etiqueta>
          )}
          {donoId && (
            <Etiqueta href={url({ dono: "" })}>
              Dono: {nomesDono.get(donoId) ?? "selecionado"}
            </Etiqueta>
          )}
          <Link
            href={url({ area: "", senso: "", auditor: "", dono: "" })}
            className="ml-auto text-xs font-semibold text-primary underline"
          >
            Limpar
          </Link>
        </div>
      )}

      {/* ---- Cartões ---- */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao
          valor={formatarTaxa(cartoes.conformidade)}
          rotulo="conformidade"
          tom={tomDaFaixa(cartoes.conformidade)}
        />
        <Cartao
          valor={`${cartoes.realizadas}/${cartoes.planejadas}`}
          rotulo="auditorias realizadas"
          tom={
            cartoes.planejadas > 0 && cartoes.realizadas === cartoes.planejadas
              ? "bom"
              : "neutro"
          }
        />
        <Cartao
          valor={String(cartoes.atrasadas)}
          rotulo="auditorias atrasadas"
          tom={cartoes.atrasadas > 0 ? "ruim" : "bom"}
        />
        <Cartao valor={String(cartoes.areas_auditadas)} rotulo="áreas auditadas" />

        <Cartao
          valor={String(cartoes.nc_abertas)}
          rotulo="não conformidades abertas"
          tom={cartoes.nc_abertas > 0 ? "alerta" : "bom"}
          href="/5s/acoes?status=aberta"
        />
        <Cartao
          valor={String(cartoes.acoes_atrasadas)}
          rotulo="ações atrasadas"
          tom={cartoes.acoes_atrasadas > 0 ? "ruim" : "bom"}
          href="/5s/acoes?atrasadas=1"
        />
        <Cartao
          valor={
            cartoes.pct_acoes_concluidas === null
              ? "—"
              : `${cartoes.pct_acoes_concluidas.toFixed(0)}%`
          }
          rotulo="ações concluídas"
          tom={tomDaFaixa(cartoes.pct_acoes_concluidas)}
          href="/5s/acoes"
        />
        <Cartao
          valor={String(cartoes.itens_nok)}
          rotulo={`itens NOK de ${cartoes.itens_ok + cartoes.itens_nok}`}
          tom={cartoes.itens_nok > 0 ? "alerta" : "bom"}
        />
      </div>

      {/* ---- A leitura executiva ----
          O requisito pedia que o BI não fosse "só gráfico bonito": que
          levasse de um indicador ao problema específico. Este bloco é a
          resposta -- ele diz, em uma frase, onde olhar, e cada pedaço
          leva para lá. */}
      {(piorArea || piorSenso) && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            Onde agir primeiro
          </h2>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {piorArea && (
              <li>
                Pior área:{" "}
                <Link
                  href={url({ area: piorArea.area_id })}
                  className="font-semibold text-primary underline"
                >
                  {piorArea.area}
                </Link>{" "}
                com {formatarTaxa(piorArea.conformidade)}
                {piorArea.nc_abertas > 0 && (
                  <>
                    {" "}e{" "}
                    <span className="font-semibold text-red-600">
                      {piorArea.nc_abertas}{" "}
                      {piorArea.nc_abertas === 1 ? "ação" : "ações"} em aberto
                    </span>
                  </>
                )}
                .
              </li>
            )}
            {piorSenso && (
              <li>
                Senso mais crítico:{" "}
                <Link
                  href={url({ senso: piorSenso.senso })}
                  className="font-semibold text-primary underline"
                >
                  {ROTULO_SENSO[piorSenso.senso]}
                </Link>{" "}
                com {formatarTaxa(piorSenso.conformidade)} e {piorSenso.nok} itens NOK.
              </li>
            )}
            {dados.perguntas[0] && (
              <li>
                Item que mais reprova:{" "}
                <span className="font-semibold text-slate-800">
                  {dados.perguntas[0].codigo}
                </span>{" "}
                — {dados.perguntas[0].taxa_nok?.toFixed(0)}% de não conformidade.
              </li>
            )}
            {cartoes.acoes_atrasadas > 0 && (
              <li>
                <Link
                  href="/5s/acoes?atrasadas=1"
                  className="font-semibold text-red-600 underline"
                >
                  {cartoes.acoes_atrasadas} ação
                  {cartoes.acoes_atrasadas === 1 ? "" : "ões"} passou do prazo
                </Link>
                .
              </li>
            )}
          </ul>
        </div>
      )}

      <Bloco titulo="Conformidade por senso">
        <RadarSensos dados={dados.por_senso} />
        <div className="rolagem-lateral -mx-2 mt-3 overflow-x-auto px-2">
          <div className="flex w-max gap-2">
            {SENSOS.map((s) => (
              <Link
                key={s}
                href={url({ senso: senso === s ? "" : s })}
                className={pilula(senso === s)}
              >
                {ROTULO_SENSO[s]}
              </Link>
            ))}
          </div>
        </div>
      </Bloco>

      <Bloco titulo="Conformidade por área" contagem={dados.por_area.length}>
        <BarrasPorArea
          dados={dados.por_area}
          areaSelecionada={areaId}
          hrefDaArea={(id) => url({ area: id ?? "" })}
        />
        <p className="mt-3 text-xs text-slate-400">
          Toque numa área para filtrar o dashboard inteiro por ela.
        </p>
      </Bloco>

      <Bloco titulo="Evolução da conformidade">
        <LinhaEvolucao dados={dados.evolucao} />
        <p className="mt-1 text-center text-xs text-slate-400">
          O gráfico ignora o filtro de mês de propósito — um mês só seria
          um ponto. Os demais filtros continuam valendo.
        </p>
      </Bloco>

      <Bloco
        titulo="Perguntas mais críticas"
        contagem={dados.perguntas.length}
      >
        <RankingPerguntas
          dados={dados.perguntas}
          hrefDaPergunta={(id) => `/5s/pergunta/${id}${mes ? `?mes=${mes}` : ""}`}
        />
      </Bloco>

      <Bloco titulo="Auditorias em aberto" contagem={dados.abertas.length}>
        {dados.abertas.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Nenhuma auditoria pendente neste recorte. 👏
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dados.abertas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/5s/auditoria/${a.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 active:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {a.area}
                    </p>
                    <p className="truncate text-xs text-slate-400">{a.auditor}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                      a.atrasada
                        ? "bg-red-50 text-red-700 ring-red-200"
                        : "bg-slate-50 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {a.planejada_para.split("-").reverse().slice(0, 2).join("/")}
                    {a.atrasada ? " · atrasada" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco
        titulo="Por auditor"
        contagem={dados.por_auditor.length}
        aberto={false}
      >
        {dados.por_auditor.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Nenhuma auditoria neste recorte.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dados.por_auditor.map((a) => (
              <li key={a.auditor_id} className="py-2.5">
                <Link
                  href={url({
                    auditor: auditorId === a.auditor_id ? "" : a.auditor_id,
                  })}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {a.nome}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      faixaDaTaxa(a.conformidade) === "critica"
                        ? "text-red-600"
                        : "text-slate-700"
                    }`}
                  >
                    {formatarTaxa(a.conformidade)}
                  </span>
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {a.realizadas} de {a.planejadas} auditoria
                  {a.planejadas === 1 ? "" : "s"} · {a.areas} área
                  {a.areas === 1 ? "" : "s"}
                  {a.pendentes > 0 && (
                    <span className="font-medium text-amber-600">
                      {" "}· {a.pendentes} pendente{a.pendentes === 1 ? "" : "s"}
                    </span>
                  )}
                  {a.nc > 0 && ` · ${a.nc} NC apontada${a.nc === 1 ? "" : "s"}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco titulo="Por dono de área" contagem={donos.length} aberto={false}>
        {donos.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Nenhuma área tem dono definido ainda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {agruparPorDono(dados.por_area, areas).map((d) => (
              <li key={d.donoId} className="py-2.5">
                <Link
                  href={url({ dono: donoId === d.donoId ? "" : d.donoId })}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {nomesDono.get(d.donoId) ?? "—"}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      faixaDaTaxa(d.conformidade) === "critica"
                        ? "text-red-600"
                        : "text-slate-700"
                    }`}
                  >
                    {formatarTaxa(d.conformidade)}
                  </span>
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {d.areas} área{d.areas === 1 ? "" : "s"}
                  {d.ncAbertas > 0 && (
                    <span className="font-medium text-red-600">
                      {" "}· {d.ncAbertas} {d.ncAbertas === 1 ? "ação" : "ações"} em aberto
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <p className="mt-4 text-xs text-slate-400">
        Conformidade = itens conformes ÷ (conformes + não conformes). Os
        itens marcados como &ldquo;não se aplica&rdquo; ficam fora da conta —
        mesma regra da planilha que a operação usa hoje.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function pilula(ativo: boolean, tom: "primario" | "escuro" = "primario") {
  const cheio = tom === "escuro" ? "bg-slate-700 text-white" : "bg-primary text-white";
  return `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
    ativo ? cheio : "bg-white text-slate-600 ring-1 ring-slate-200"
  }`;
}

function Etiqueta({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
    >
      {children}
      <span className="text-slate-400" aria-hidden="true">
        ×
      </span>
      <span className="sr-only">remover filtro</span>
    </Link>
  );
}

function tomDaFaixa(taxa: number | null) {
  const f = faixaDaTaxa(taxa);
  if (f === "boa") return "bom" as const;
  if (f === "atencao") return "alerta" as const;
  if (f === "critica") return "ruim" as const;
  return "neutro" as const;
}

/**
 * Junta as áreas pelo dono vigente.
 *
 * Feito aqui, com dados que a página já tem na mão, e não com uma
 * consulta a mais: são vinte áreas, e uma ida ao banco para agrupar
 * vinte linhas em memória custaria mais do que a conta.
 */
function agruparPorDono(
  porArea: { area_id: string; conformidade: number | null; nc_abertas: number; itens: number }[],
  areas: { id: string; dono_id: string | null }[],
) {
  const donoDaArea = new Map(areas.map((a) => [a.id, a.dono_id]));
  const acc = new Map<
    string,
    { donoId: string; areas: number; ok: number; total: number; ncAbertas: number }
  >();

  for (const a of porArea) {
    const dono = donoDaArea.get(a.area_id);
    if (!dono) continue;
    const atual = acc.get(dono) ?? {
      donoId: dono,
      areas: 0,
      ok: 0,
      total: 0,
      ncAbertas: 0,
    };
    atual.areas++;
    atual.ncAbertas += a.nc_abertas;
    // Pondera pelo número de itens: a média das médias trataria uma área
    // com 4 itens avaliados igual a outra com 25.
    if (a.conformidade !== null && a.itens > 0) {
      atual.ok += (a.conformidade / 100) * a.itens;
      atual.total += a.itens;
    }
    acc.set(dono, atual);
  }

  return Array.from(acc.values())
    .map((d) => ({
      ...d,
      conformidade:
        d.total > 0 ? Math.round((d.ok / d.total) * 1000) / 10 : null,
    }))
    .sort((a, b) => (a.conformidade ?? 101) - (b.conformidade ?? 101));
}
