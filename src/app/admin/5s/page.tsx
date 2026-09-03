import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { listarAreas, listarPerguntas, nomesDe } from "@/lib/cinco-s-server";
import {
  EMOJI_SENSO,
  ROTULO_SENSO,
  ROTULO_STATUS_AUDITORIA,
  SENSOS,
  competenciaAtual,
  formatarTaxa,
  rotuloCompetencia,
  type StatusAuditoria,
  hojeISO,
} from "@/lib/cinco-s";
import {
  alternarAuditor,
  cancelarAuditoria,
  cobrarPendentes,
  excluirArea,
  planejarAno,
  planejarAuditoria,
  planejarMes,
  salvarArea,
  salvarAuditor,
  salvarPergunta,
  trocarAuditor,
  trocarAuditorDaArea,
} from "./actions";

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "planejamento", rotulo: "Planejamento" },
  { id: "areas", rotulo: "Áreas" },
  { id: "auditores", rotulo: "Auditores" },
  { id: "perguntas", rotulo: "Checklist" },
] as const;

/**
 * Os recortes da grade do mês.
 *
 * "Pendentes" é o motivo de o filtro existir: é a lista que a gestão
 * leva para cobrar. Por isso ela é a única que também mostra as áreas
 * que sequer foram agendadas -- do ponto de vista de quem cobra, área
 * sem auditoria marcada está tão pendente quanto a marcada e não feita.
 */
const VISOES = [
  { id: "todas", rotulo: "Todas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "feitas", rotulo: "Realizadas" },
] as const;

type Visao = (typeof VISOES)[number]["id"];

type Params = {
  aba?: string;
  erro?: string;
  sucesso?: string;
  editar?: string;
  mes?: string;
  ver?: string;
};

/**
 * Painel de gestão do Programa 5S.
 *
 * Abas em vez de quatro telas: cadastrar área, habilitar auditor e
 * planejar o mês são coisas que se fazem na mesma sentada, no começo do
 * ciclo. Separá-las em páginas obrigaria a voltar ao menu entre cada uma.
 *
 * Só a aba aberta consulta o banco. Carregar as quatro a cada abertura
 * seria pagar por três telas que ninguém está olhando.
 */
export default async function Admin5SPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireModulo("5s", "ver");
  const revendaId = await exigirRevenda("/admin");

  const p = await searchParams;
  const aba = ABAS.some((a) => a.id === p.aba) ? p.aba! : "planejamento";
  const mes = p.mes ?? competenciaAtual();
  const visao: Visao = (VISOES.find((v) => v.id === p.ver)?.id ?? "todas");

  return (
    <div>
      <PageHeader
        title="🧹 Programa 5S"
        subtitle="Áreas, auditores, planejamento e checklist"
      />

      {p.erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(p.erro)}
        </p>
      )}
      {p.sucesso && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(p.sucesso)}
        </p>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/5s/bi"
          className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-semibold text-white active:bg-primary-dark"
        >
          📊 Abrir o BI 5S
        </Link>
        <Link
          href="/5s/acoes"
          className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-sm font-semibold text-slate-700"
        >
          Plano de ação
        </Link>
      </div>

      <div className="rolagem-lateral -mx-4 mb-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={`/admin/5s?aba=${a.id}`}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                aba === a.id
                  ? "bg-slate-700 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {aba === "planejamento" && (
        <AbaPlanejamento revendaId={revendaId} mes={mes} visao={visao} />
      )}
      {aba === "areas" && (
        <AbaAreas revendaId={revendaId} editando={p.editar ?? null} />
      )}
      {aba === "auditores" && <AbaAuditores revendaId={revendaId} />}
      {aba === "perguntas" && <AbaPerguntas revendaId={revendaId} />}
    </div>
  );
}

/* ================================================================== */
/* PLANEJAMENTO                                                       */
/* ================================================================== */

async function AbaPlanejamento({
  revendaId,
  mes,
  visao,
}: {
  revendaId: string;
  mes: string;
  visao: Visao;
}) {
  const admin = createAdminClient();

  const [{ data: auditorias }, todasAsAreas, auditores, { data: meses }] =
    await Promise.all([
      admin
        .from("cinco_s_auditorias")
        .select(
          "id, area_id, auditor_id, status, planejada_para, conformidade, total_nok, cinco_s_areas!inner(nome)",
        )
        .eq("revenda_id", revendaId)
        .eq("competencia", `${mes}-01`)
        .neq("status", "cancelada")
        .order("planejada_para"),
      // A lista vem inteira, e não só as ativas: a grade do mês pode
      // conter auditoria de área que foi desativada depois de agendada,
      // e é daqui que sai o nome do dono de cada linha.
      listarAreas(revendaId),
      auditoresAtivos(revendaId),
      admin.rpc("cinco_s_competencias", { p_revenda: revendaId }),
    ]);

  const areas = todasAsAreas.filter((a) => a.ativa);
  const donoDaArea = new Map(todasAsAreas.map((a) => [a.id, a.dono_nome]));

  const lista = auditorias ?? [];
  // Histórico importado pode não ter auditor (ver migração 038).
  const nomes = await nomesDe(
    lista.map((a) => a.auditor_id).filter((x): x is string => Boolean(x)),
  );

  const feitas = lista.filter((a) => a.status === "finalizada").length;
  const hoje = hojeISO();
  const atrasadas = lista.filter(
    (a) => a.status !== "finalizada" && a.planejada_para < hoje,
  ).length;
  const semAuditoria = areas.filter(
    (ar) => !lista.some((a) => a.area_id === ar.id),
  );

  const competencias: string[] = ((meses ?? []) as { competencia: string }[]).map(
    (m) => m.competencia,
  );
  if (!competencias.includes(mes)) competencias.unshift(mes);

  /** Troca um filtro sem perder o outro. */
  const url = (mudanca: { mes?: string; ver?: Visao }) => {
    const q = new URLSearchParams({ aba: "planejamento" });
    q.set("mes", mudanca.mes ?? mes);
    const v = mudanca.ver ?? visao;
    if (v !== "todas") q.set("ver", v);
    return `/admin/5s?${q}`;
  };

  // O recorte da grade. "Pendente" é tudo que não foi finalizado --
  // planejada e em andamento juntas: quem cobra não distingue a área que
  // nem começou da que parou no meio, as duas continuam devendo o mês.
  const pendentesDoMes = lista.filter((a) => a.status !== "finalizada");

  const visiveis =
    visao === "pendentes"
      ? pendentesDoMes
      : visao === "atrasadas"
        ? lista.filter(
            (a) => a.status !== "finalizada" && a.planejada_para < hoje,
          )
        : visao === "feitas"
          ? lista.filter((a) => a.status === "finalizada")
          : lista;

  // Área ativa sem auditoria agendada no mês também é pendência, e é a
  // mais fácil de esquecer -- ela não aparece em lista nenhuma porque
  // não existe registro para aparecer. Entra na visão de pendentes.
  const naoAgendadas = visao === "pendentes" ? semAuditoria : [];
  const totalNaGrade = visiveis.length + naoAgendadas.length;

  // Quem a cobrança vai tocar. A conta é feita aqui só para o botão
  // poder dizer o número ANTES do clique -- quem manda mensagem para os
  // outros precisa saber para quantos está mandando. A lista de verdade
  // é remontada na ação, do banco, na hora de enviar.
  const donoIdDaArea = new Map(todasAsAreas.map((a) => [a.id, a.dono_id]));
  const auditoresACobrar = new Set(
    pendentesDoMes
      .map((a) => a.auditor_id)
      .filter((x): x is string => Boolean(x)),
  );
  const donosAAvisar = new Set(
    pendentesDoMes
      .map((a) =>
        donoIdDaArea.get(a.area_id) !== a.auditor_id
          ? donoIdDaArea.get(a.area_id)
          : null,
      )
      .filter((x): x is string => Boolean(x)),
  );

  return (
    <div className="space-y-4">
      <div className="rolagem-lateral -mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex w-max gap-2">
          {competencias.slice(0, 12).map((c) => (
            <Link
              key={c}
              href={url({ mes: c })}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                c === mes
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {rotuloCompetencia(c).replace(" de ", "/")}
            </Link>
          ))}
        </div>
      </div>

      {/* Os números não são só placar: cada um é a entrada do recorte
          que ele conta. Ver "3 pendentes" e não conseguir clicar para
          saber QUAIS obriga a caçar as três na lista inteira. */}
      <div className="grid grid-cols-4 gap-2">
        <Mini
          valor={lista.length}
          rotulo="planejadas"
          href={url({ ver: "todas" })}
          ativo={visao === "todas"}
        />
        <Mini
          valor={feitas}
          rotulo="realizadas"
          tom="bom"
          href={url({ ver: "feitas" })}
          ativo={visao === "feitas"}
        />
        <Mini
          valor={lista.length - feitas + semAuditoria.length}
          rotulo="pendentes"
          tom="alerta"
          href={url({ ver: "pendentes" })}
          ativo={visao === "pendentes"}
        />
        <Mini
          valor={atrasadas}
          rotulo="atrasadas"
          tom={atrasadas > 0 ? "ruim" : "bom"}
          href={url({ ver: "atrasadas" })}
          ativo={visao === "atrasadas"}
        />
      </div>

      {/* ---- Agendar o mês inteiro ---- */}
      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
          Agendar o mês inteiro
          {semAuditoria.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {semAuditoria.length} área{semAuditoria.length === 1 ? "" : "s"} sem auditoria
            </span>
          )}
        </summary>
        <form action={planejarMes} className="space-y-3 border-t border-slate-100 p-4">
          <input type="hidden" name="competencia" value={mes} />
          <p className="text-xs text-slate-500">
            Cria uma auditoria para cada área ativa que ainda não tem uma em{" "}
            {rotuloCompetencia(mes)}, repetindo em cada área o auditor que a
            auditou da última vez.
          </p>
          <CamposDoPlano auditores={auditores} />
          <BotaoEnviar textoEnviando="Agendando..." className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark">Agendar {rotuloCompetencia(mes)}</BotaoEnviar>
        </form>
      </details>

      {/* ---- Agendar o ano ---- */}
      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
          Agendar o ano inteiro
        </summary>
        <form action={planejarAno} className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">
            Mesma regra do mês, repetida até dezembro. Começa no mês corrente
            quando o ano é o atual. Mês que já tiver auditoria marcada para a
            área é pulado — dá para rodar de novo depois de cadastrar uma área
            nova, que só as lacunas são preenchidas.
          </p>
          <label className="block text-xs font-semibold text-slate-600">
            Ano
            <select
              name="ano"
              defaultValue={String(new Date().getFullYear())}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            >
              {[0, 1].map((i) => {
                const a = new Date().getFullYear() + i;
                return (
                  <option key={a} value={a}>
                    {a}
                  </option>
                );
              })}
            </select>
          </label>
          <CamposDoPlano auditores={auditores} />
          <BotaoEnviar textoEnviando="Agendando o ano..." className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark">Agendar o ano</BotaoEnviar>
          <p className="text-xs text-slate-400">
            O auditor recebe um aviso só, com o total do ano. O lembrete de
            cada auditoria chega na véspera e no dia dela.
          </p>
        </form>
      </details>

      {/* ---- Agendar uma ---- */}
      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
          Agendar uma auditoria
        </summary>
        <form
          action={planejarAuditoria}
          className="space-y-3 border-t border-slate-100 p-4"
        >
          <label className="block text-xs font-semibold text-slate-600">
            Área
            <select
              name="area_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.dono_nome ? ` — ${a.dono_nome}` : " — sem dono"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Auditor
            <select
              name="auditor_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            >
              {auditores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Data prevista
            <input
              type="date"
              name="planejada_para"
              required
              defaultValue={`${mes}-15`}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Observação
            <input
              name="observacao"
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
          <BotaoEnviar textoEnviando="Agendando..." className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark">Agendar e avisar o auditor</BotaoEnviar>
        </form>
      </details>

      {/* ---- A grade do mês ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-4 pb-2 text-sm font-semibold text-slate-800">
          {rotuloCompetencia(mes)}
          <span className="ml-2 font-normal text-slate-400">
            ({totalNaGrade})
          </span>
        </h2>

        {/* ---- O filtro da grade ---- */}
        <div className="rolagem-lateral overflow-x-auto px-4 pb-3">
          <div className="flex w-max gap-2">
            {VISOES.map((v) => (
              <Link
                key={v.id}
                href={url({ ver: v.id })}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  visao === v.id
                    ? "bg-slate-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {v.rotulo}
              </Link>
            ))}
          </div>
        </div>

        {visao === "pendentes" && (
          <p className="px-4 pb-3 text-xs text-slate-500">
            Tudo que ainda deve o mês: auditoria marcada e não finalizada,
            mais as áreas ativas que sequer entraram no plano. O nome ao
            lado é de quem cobrar — auditor e dono da área.
          </p>
        )}

        {totalNaGrade === 0 ? (
          <p className="p-6 pt-2 text-center text-sm text-slate-500">
            {visao === "pendentes"
              ? `Nenhuma pendência em ${rotuloCompetencia(mes)}. 👏`
              : visao === "atrasadas"
                ? "Nenhuma auditoria atrasada neste mês. 👏"
                : visao === "feitas"
                  ? "Nenhuma auditoria finalizada neste mês ainda."
                  : "Nenhuma auditoria agendada neste mês."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {naoAgendadas.map((ar) => (
              <li key={`sem-${ar.id}`} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {ar.nome}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {ar.dono_nome ?? "sem dono definido"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                    Não agendada
                  </span>
                </div>
              </li>
            ))}
            {visiveis.map((a) => {
              const area = (
                Array.isArray(a.cinco_s_areas)
                  ? a.cinco_s_areas[0]
                  : a.cinco_s_areas
              ) as { nome: string };
              const atrasada =
                a.status !== "finalizada" && a.planejada_para < hoje;
              return (
                <li key={a.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/5s/auditoria/${a.id}`}
                        className="truncate text-sm font-medium text-slate-800 hover:underline"
                      >
                        {area.nome}
                      </Link>
                      <p className="truncate text-xs text-slate-400">
                        {(a.auditor_id ? nomes.get(a.auditor_id) : null) ??
                          "auditor não cadastrado"}{" "}
                        ·{" "}
                        {a.planejada_para.split("-").reverse().join("/")}
                      </p>
                      {/* O dono só aparece nos recortes de cobrança: é
                          nesses que a pergunta "quem eu aviso?" existe.
                          Na grade cheia ele seria uma linha a mais em
                          cada item sem ninguém para ler. */}
                      {a.status !== "finalizada" &&
                        (visao === "pendentes" || visao === "atrasadas") && (
                          <p className="truncate text-xs text-slate-400">
                            Dono da área:{" "}
                            <span className="font-medium text-slate-600">
                              {donoDaArea.get(a.area_id) ?? "sem dono definido"}
                            </span>
                          </p>
                        )}
                    </div>
                    <div className="shrink-0 text-right">
                      {a.status === "finalizada" ? (
                        <p className="text-sm font-bold tabular-nums text-primary">
                          {formatarTaxa(a.conformidade)}
                        </p>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                            atrasada
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "bg-slate-50 text-slate-600 ring-slate-200"
                          }`}
                        >
                          {atrasada
                            ? "Atrasada"
                            : ROTULO_STATUS_AUDITORIA[a.status as StatusAuditoria]}
                        </span>
                      )}
                      {a.status !== "finalizada" && (
                        <form action={cancelarAuditoria} className="mt-1">
                          <input type="hidden" name="id" value={a.id} />
                          <BotaoEnviar textoEnviando="cancelando..." className="text-xs text-slate-400 underline hover:text-red-600">cancelar</BotaoEnviar>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Trocar só esta. O caso do rodízio inteiro -- "de
                      agora em diante quem audita esta área é outro" --
                      é na aba Áreas; aqui é a substituição de um mês,
                      por férias ou folga. */}
                  {a.status !== "finalizada" && auditores.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer list-none text-xs text-slate-400 underline">
                        trocar o auditor desta
                      </summary>
                      <form
                        action={trocarAuditor}
                        className="mt-2 flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={a.id} />
                        <select
                          name="auditor_id"
                          required
                          defaultValue={a.auditor_id ?? ""}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                        >
                          {auditores.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nome}
                            </option>
                          ))}
                        </select>
                        <BotaoEnviar
                          textoEnviando="trocando..."
                          className="shrink-0 rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Trocar
                        </BotaoEnviar>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---- Cobrar quem está devendo o mês ----

          Só existe na visão de pendentes, e de propósito: o botão que
          dispara mensagem para o time inteiro não pode ficar solto na
          tela cheia, onde se clica nele sem ter lido quem está na lista.
          Aqui ele vem DEPOIS da lista -- quem chegou até o botão já
          passou pelos nomes. */}
      {visao === "pendentes" && pendentesDoMes.length > 0 && (
        <form
          action={cobrarPendentes}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <input type="hidden" name="competencia" value={mes} />
          <h3 className="text-sm font-semibold text-amber-900">
            Avisar quem está devendo
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            Manda um aviso no app e no celular para{" "}
            <strong>
              {auditoresACobrar.size} auditor
              {auditoresACobrar.size === 1 ? "" : "es"}
            </strong>
            {donosAAvisar.size > 0 && (
              <>
                {" "}
                e <strong>{donosAAvisar.size} dono{donosAAvisar.size === 1 ? "" : "s"} de área</strong>
              </>
            )}
            , sobre as {pendentesDoMes.length} auditoria
            {pendentesDoMes.length === 1 ? "" : "s"} pendente
            {pendentesDoMes.length === 1 ? "" : "s"} de{" "}
            {rotuloCompetencia(mes)}. Cada pessoa recebe UM aviso, com as
            áreas dela dentro.
          </p>
          {donosAAvisar.size > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs text-amber-900">
              <input
                type="checkbox"
                name="donos"
                defaultChecked
                className="h-4 w-4"
              />
              Avisar também os donos das áreas
            </label>
          )}
          {naoAgendadas.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              As {naoAgendadas.length} área{naoAgendadas.length === 1 ? "" : "s"} não
              agendada{naoAgendadas.length === 1 ? "" : "s"} ficam de fora — não
              há auditor para cobrar. Agende primeiro.
            </p>
          )}
          <BotaoEnviar
            textoEnviando="Enviando os avisos..."
            className="mt-3 w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white active:bg-amber-700"
          >
            Cobrar pendentes
          </BotaoEnviar>
          <p className="mt-2 text-xs text-amber-700">
            A mesma cobrança só sai de novo depois de 6 horas.
          </p>
        </form>
      )}

      {/* Na visão de pendentes essas áreas já estão listadas uma a uma,
          com dono e tudo -- repeti-las aqui em texto corrido seria dizer
          a mesma coisa duas vezes na mesma tela. */}
      {semAuditoria.length > 0 && visao !== "pendentes" && (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
          Sem auditoria em {rotuloCompetencia(mes)}:{" "}
          {semAuditoria.map((a) => a.nome).join(", ")}.{" "}
          <Link href={url({ ver: "pendentes" })} className="font-semibold underline">
            Ver as pendências
          </Link>
        </p>
      )}

      <Exportar mes={mes} />
    </div>
  );
}

/**
 * Download do que já foi auditado, para continuar alimentando a
 * planilha de acompanhamento.
 *
 * Link comum, não botão com JavaScript: o navegador baixa o arquivo
 * direto da rota, sem a página precisar montar nada em memória.
 */
function Exportar({ mes }: { mes: string }) {
  const opcoes = [
    {
      formato: "base",
      titulo: "Base (formato do Forms)",
      ajuda:
        "Uma linha por auditoria, com as 25 respostas em colunas. Cola direto embaixo da Base_Bruta da sua planilha.",
    },
    {
      formato: "resumo",
      titulo: "Resumo por auditoria",
      ajuda:
        "Uma linha por auditoria com a nota geral e a de cada senso, já calculadas.",
    },
    {
      formato: "detalhado",
      titulo: "Detalhado (uma linha por item)",
      ajuda:
        "O desenho da Base_Tratada: cada pergunta em uma linha, com a observação do auditor.",
    },
    {
      formato: "acoes",
      titulo: "Plano de ação",
      ajuda:
        "As não conformidades com responsável, prazo, situação e o que já foi atrasado.",
    },
  ];

  return (
    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
        Exportar para a planilha
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        {opcoes.map((o) => (
          <div key={o.formato}>
            <p className="text-sm font-medium text-slate-700">{o.titulo}</p>
            <p className="mb-1.5 text-xs text-slate-400">{o.ajuda}</p>
            <div className="flex gap-2">
              <a
                href={`/api/5s/exportar?formato=${o.formato}&mes=${mes}`}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-center text-xs font-semibold text-slate-700 active:bg-slate-50"
              >
                {rotuloCompetencia(mes).replace(" de ", "/")}
              </a>
              <a
                href={`/api/5s/exportar?formato=${o.formato}`}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-center text-xs font-semibold text-slate-700 active:bg-slate-50"
              >
                Histórico completo
              </a>
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-400">
          Arquivo CSV separado por ponto e vírgula, em UTF-8 — abre no Excel
          em português com dois cliques, acentos e colunas no lugar.
        </p>
      </div>
    </details>
  );
}

/* ================================================================== */
/* ÁREAS                                                              */
/* ================================================================== */

async function AbaAreas({
  revendaId,
  editando,
}: {
  revendaId: string;
  editando: string | null;
}) {
  const [areas, pessoas, auditores, abertas] = await Promise.all([
    listarAreas(revendaId),
    pessoasDaRevenda(revendaId),
    auditoresAtivos(revendaId),
    // Quem está escalado daqui para a frente. É esta a resposta para
    // "quem é o auditor da Portaria?" -- o módulo não guarda auditor no
    // cadastro da área, ele mora em cada auditoria. Sem mostrar isto na
    // lista, trocar o auditor seria trocar às cegas.
    auditoriasAbertasPorArea(revendaId),
  ]);

  const emEdicao = editando ? areas.find((a) => a.id === editando) : null;

  return (
    <div className="space-y-4">
      <details
        open={Boolean(emEdicao)}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800">
          {emEdicao ? `Editando: ${emEdicao.nome}` : "Cadastrar área"}
        </summary>
        <form action={salvarArea} className="space-y-3 border-t border-slate-100 p-4">
          {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
          <label className="block text-xs font-semibold text-slate-600">
            Nome
            <input
              name="nome"
              required
              defaultValue={emEdicao?.nome ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1 text-xs font-semibold text-slate-600">
              Local / unidade
              <input
                name="local"
                defaultValue={emEdicao?.local ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex-1 text-xs font-semibold text-slate-600">
              Dono da área
              <select
                name="dono_id"
                defaultValue={emEdicao?.dono_id ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              >
                <option value="">— sem dono —</option>
                {pessoas.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            Descrição
            <input
              name="descricao"
              defaultValue={emEdicao?.descricao ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="ativa"
              defaultChecked={emEdicao?.ativa ?? true}
              className="h-4 w-4"
            />
            Área ativa (entra no planejamento mensal)
          </label>
          <div className="flex gap-2">
            <BotaoEnviar textoEnviando="Salvando..." className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark">{emEdicao ? "Salvar alterações" : "Cadastrar"}</BotaoEnviar>
            {emEdicao && (
              <Link
                href="/admin/5s?aba=areas"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
              >
                Cancelar
              </Link>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Trocar o dono não apaga o histórico: as auditorias já feitas
            continuam registradas no nome de quem respondia pela área na época.
          </p>
        </form>
      </details>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-4 pb-2 text-sm font-semibold text-slate-800">
          Áreas <span className="font-normal text-slate-400">({areas.length})</span>
        </h2>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {areas.map((a) => {
            const escala = abertas.get(a.id) ?? [];
            const quantas = escala.reduce((s, e) => s + e.quantas, 0);
            return (
              <li key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {a.nome}
                      {!a.ativa && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          inativa
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      Dono: {a.dono_nome ?? "sem dono definido"}
                      {a.local ? ` · ${a.local}` : ""}
                    </p>
                    {/* Dono e auditor são papéis diferentes e costumam
                        ser a mesma pessoa por descuido, não por escolha
                        -- quem audita a própria área se audita. Mostrar
                        os dois lado a lado é o que torna isso visível. */}
                    <p className="truncate text-xs text-slate-400">
                      Auditor:{" "}
                      {escala.length === 0 ? (
                        <span className="text-slate-400">
                          nenhuma auditoria aberta
                        </span>
                      ) : (
                        <span className="font-medium text-slate-600">
                          {escala.map((e) => e.nome).join(", ")}
                        </span>
                      )}
                      {escala.length === 1 && escala[0].id === a.dono_id && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          audita a própria área
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/admin/5s?aba=areas&editar=${a.id}`}
                      className="text-xs font-semibold text-primary underline"
                    >
                      editar
                    </Link>
                    <form action={excluirArea}>
                      <input type="hidden" name="id" value={a.id} />
                      <BotaoEnviar textoEnviando="excluindo..." className="text-xs text-slate-400 underline hover:text-red-600">excluir</BotaoEnviar>
                    </form>
                  </div>
                </div>

                {auditores.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none text-xs text-slate-400 underline">
                      trocar o auditor da área
                    </summary>
                    <form
                      action={trocarAuditorDaArea}
                      className="mt-2 space-y-2"
                    >
                      <input type="hidden" name="area_id" value={a.id} />
                      <div className="flex items-center gap-2">
                        <select
                          name="auditor_id"
                          required
                          defaultValue={
                            escala.length === 1 ? escala[0].id : ""
                          }
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                        >
                          <option value="">— escolha o auditor —</option>
                          {auditores.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nome}
                              {x.id === a.dono_id ? " (dono da área)" : ""}
                            </option>
                          ))}
                        </select>
                        <BotaoEnviar
                          textoEnviando="trocando..."
                          className="shrink-0 rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Trocar
                        </BotaoEnviar>
                      </div>
                      <p className="text-xs text-slate-400">
                        {quantas > 0
                          ? `Passa as ${quantas} auditoria${quantas === 1 ? "" : "s"} aberta${quantas === 1 ? "" : "s"} desta área — deste mês em diante — para o auditor escolhido. As duas pessoas são avisadas.`
                          : "Não há auditoria aberta deste mês em diante. Agende no Planejamento antes de definir o auditor."}{" "}
                        O histórico não muda: auditoria já feita continua
                        no nome de quem fez.
                      </p>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ================================================================== */
/* AUDITORES                                                          */
/* ================================================================== */

async function AbaAuditores({ revendaId }: { revendaId: string }) {
  const admin = createAdminClient();

  const [{ data: vinculos }, pessoas] = await Promise.all([
    admin
      .from("cinco_s_auditores")
      .select("colaborador_id, ativo")
      .eq("revenda_id", revendaId),
    pessoasDaRevenda(revendaId),
  ]);

  const mapa = new Map(pessoas.map((p) => [p.id, p.nome]));
  const jaSao = new Set((vinculos ?? []).map((v) => v.colaborador_id));

  // A contagem por auditor sai pronta do banco. Antes eram até 5.000
  // auditorias trafegadas para montar um mapa aqui -- com o ciclo do
  // ano planejado, esse número passa de 200 por ano e só cresce.
  const { data: contagens } = await admin.rpc("cinco_s_contagem_auditores", {
    p_revenda: revendaId,
  });

  const feitasPor = new Map<string, { feitas: number; pendentes: number }>(
    ((contagens ?? []) as {
      auditor_id: string;
      feitas: number;
      pendentes: number;
    }[]).map((c) => [
      c.auditor_id,
      { feitas: Number(c.feitas), pendentes: Number(c.pendentes) },
    ]),
  );

  return (
    <div className="space-y-4">
      <form
        action={salvarAuditor}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="block text-xs font-semibold text-slate-600">
          Habilitar auditor
          <select
            name="colaborador_id"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          >
            <option value="">— escolha um colaborador —</option>
            {pessoas
              .filter((x) => !jaSao.has(x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
          </select>
        </label>
        <BotaoEnviar textoEnviando="Habilitando..." className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark">Habilitar</BotaoEnviar>
        <p className="mt-2 text-xs text-slate-400">
          A lista traz quem já está cadastrado no app e pertence a esta
          revenda — o 5S não cria usuário novo.
        </p>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-4 pb-2 text-sm font-semibold text-slate-800">
          Auditores{" "}
          <span className="font-normal text-slate-400">
            ({(vinculos ?? []).length})
          </span>
        </h2>
        {(vinculos ?? []).length === 0 ? (
          <p className="p-6 pt-2 text-center text-sm text-slate-500">
            Nenhum auditor habilitado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {(vinculos ?? [])
              .slice()
              .sort((a, b) =>
                (mapa.get(a.colaborador_id) ?? "").localeCompare(
                  mapa.get(b.colaborador_id) ?? "",
                  "pt-BR",
                ),
              )
              .map((v) => {
                const c = feitasPor.get(v.colaborador_id);
                return (
                  <li
                    key={v.colaborador_id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {mapa.get(v.colaborador_id) ?? "—"}
                        {!v.ativo && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            inativo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c?.feitas ?? 0} auditoria{(c?.feitas ?? 0) === 1 ? "" : "s"} realizada
                        {(c?.feitas ?? 0) === 1 ? "" : "s"}
                        {(c?.pendentes ?? 0) > 0 && (
                          <span className="font-medium text-amber-600">
                            {" "}· {c!.pendentes} pendente{c!.pendentes === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                    </div>
                    <form action={alternarAuditor} className="shrink-0">
                      <input
                        type="hidden"
                        name="colaborador_id"
                        value={v.colaborador_id}
                      />
                      <input
                        type="hidden"
                        name="ativo"
                        value={v.ativo ? "false" : "true"}
                      />
                      <BotaoEnviar textoEnviando="Salvando..." className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">{v.ativo ? "Desativar" : "Reativar"}</BotaoEnviar>
                    </form>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* CHECKLIST                                                          */
/* ================================================================== */

async function AbaPerguntas({ revendaId }: { revendaId: string }) {
  const perguntas = await listarPerguntas(revendaId);

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-primary-soft p-3 text-xs text-primary-dark">
        As {perguntas.length} perguntas vieram da planilha que a operação já
        usa, na ordem original. Três delas (1.1, 2.3 e 4.4) chegaram cortadas
        pelo export do Microsoft Forms e terminam em &ldquo;…&rdquo; — dá para
        completar aqui. Editar o texto não mexe no histórico: as respostas
        apontam para a pergunta, não para a frase.
      </p>

      {SENSOS.map((s) => {
        const doSenso = perguntas.filter((q) => q.senso === s);
        if (doSenso.length === 0) return null;
        return (
          <div
            key={s}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <h2 className="flex items-center gap-2 p-4 pb-2 text-sm font-semibold text-slate-800">
              <span aria-hidden="true">{EMOJI_SENSO[s]}</span>
              {ROTULO_SENSO[s]}
              <span className="font-normal text-slate-400">
                ({doSenso.length})
              </span>
            </h2>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {doSenso.map((q) => (
                <li key={q.id} className="p-3">
                  <details>
                    <summary className="cursor-pointer list-none text-sm leading-snug text-slate-700">
                      <span className="font-bold text-slate-900">
                        {q.codigo}
                      </span>{" "}
                      {q.texto}
                      {q.texto.endsWith("...") && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          cortada
                        </span>
                      )}
                    </summary>
                    <form action={salvarPergunta} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={q.id} />
                      <textarea
                        name="texto"
                        rows={3}
                        defaultValue={q.texto}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
                      />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            name="ativa"
                            defaultChecked
                            className="h-4 w-4"
                          />
                          ativa no checklist
                        </label>
                        <BotaoEnviar textoEnviando="Salvando..." className="ml-auto rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white">Salvar</BotaoEnviar>
                      </div>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Auxiliares                                                         */
/* ================================================================== */

/**
 * As pessoas desta revenda, para os seletores.
 *
 * Duas consultas: os vínculos e os nomes. O join direto entre
 * colaborador_revendas e profiles não existe no PostgREST (não há chave
 * estrangeira declarada entre elas), e forçá-lo daria erro em produção.
 */
async function pessoasDaRevenda(revendaId: string) {
  const admin = createAdminClient();

  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);

  const ids = (vinculos ?? []).map((v) => v.colaborador_id);
  if (ids.length === 0) return [];

  const { data } = await admin
    .from("profiles")
    .select("id, nome, cargo")
    .in("id", ids)
    .order("nome");

  return (data ?? []) as { id: string; nome: string; cargo: string | null }[];
}

/**
 * Quem está escalado em cada área daqui para a frente.
 *
 * O módulo não tem "auditor da área" no cadastro -- o auditor mora em
 * cada auditoria, o que é o desenho certo (o rodízio muda, e o
 * histórico precisa lembrar quem fez o quê). O preço é que a pergunta
 * mais banal da gestão, "quem audita a Portaria?", não tem campo para
 * responder. Esta função responde: é quem está nas auditorias abertas
 * do mês corrente em diante.
 *
 * Normalmente é uma pessoa só por área. Vem como lista porque uma troca
 * feita auditoria por auditoria pode deixar duas -- e esconder isso
 * mostraria um nome só para uma área que tem dois.
 */
async function auditoriasAbertasPorArea(revendaId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("cinco_s_auditorias")
    .select("area_id, auditor_id")
    .eq("revenda_id", revendaId)
    .in("status", ["planejada", "em_andamento"])
    .gte("competencia", `${competenciaAtual()}-01`);

  const linhas = (data ?? []).filter(
    (a): a is { area_id: string; auditor_id: string } => Boolean(a.auditor_id),
  );

  const nomes = await nomesDe(
    Array.from(new Set(linhas.map((a) => a.auditor_id))),
  );

  const mapa = new Map<string, { id: string; nome: string; quantas: number }[]>();

  for (const l of linhas) {
    const lista = mapa.get(l.area_id) ?? [];
    const achado = lista.find((x) => x.id === l.auditor_id);
    if (achado) achado.quantas += 1;
    else {
      lista.push({
        id: l.auditor_id,
        nome: nomes.get(l.auditor_id) ?? "—",
        quantas: 1,
      });
    }
    mapa.set(l.area_id, lista);
  }

  for (const lista of mapa.values()) {
    lista.sort((a, b) => b.quantas - a.quantas);
  }

  return mapa;
}

async function auditoresAtivos(revendaId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cinco_s_auditores")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("ativo", true);

  const ids = (data ?? []).map((a) => a.colaborador_id);
  const nomes = await nomesDe(ids);

  return ids
    .map((id) => ({ id, nome: nomes.get(id) ?? "—" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Dia previsto e auditor padrão -- os dois campos que o plano do mês e
 * o do ano têm em comum.
 *
 * O texto de ajuda do auditor padrão está aqui porque a dúvida é real:
 * lendo só o rótulo, entende-se "o auditor de tudo", que é o oposto do
 * que ele faz. Ele é a saída para a área SEM histórico -- nas demais,
 * quem manda é quem auditou da última vez.
 */
function CamposDoPlano({
  auditores,
}: {
  auditores: { id: string; nome: string }[];
}) {
  return (
    <>
      <div className="flex gap-2">
        <label className="flex-1 text-xs font-semibold text-slate-600">
          Dia previsto
          <input
            type="number"
            name="dia"
            min={1}
            max={28}
            defaultValue={15}
            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex-1 text-xs font-semibold text-slate-600">
          Auditor padrão
          <select
            name="auditor_padrao"
            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          >
            <option value="">— nenhum —</option>
            {auditores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-400">
        <strong>Auditor padrão</strong> só é usado nas áreas que nunca foram
        auditadas — nelas não há histórico de onde tirar o nome. Nas demais,
        cada área mantém o auditor da última vez. Depois dá para trocar
        auditoria por auditoria na lista abaixo.
      </p>
    </>
  );
}

function Mini({
  valor,
  rotulo,
  tom = "neutro",
  href,
  ativo = false,
}: {
  valor: number;
  rotulo: string;
  tom?: "neutro" | "bom" | "alerta" | "ruim";
  href?: string;
  ativo?: boolean;
}) {
  const cor = {
    neutro: "text-slate-700",
    bom: "text-green-600",
    alerta: "text-amber-600",
    ruim: "text-red-600",
  }[tom];

  const classe = `rounded-2xl border bg-white p-2.5 text-center shadow-sm ${
    ativo ? "border-slate-700 ring-1 ring-slate-700" : "border-slate-200"
  }`;

  const conteudo = (
    <>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </>
  );

  if (!href) return <div className={classe}>{conteudo}</div>;

  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={`${classe} block active:bg-slate-50`}
    >
      {conteudo}
    </Link>
  );
}
