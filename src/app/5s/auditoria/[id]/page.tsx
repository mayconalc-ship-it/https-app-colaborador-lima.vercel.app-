import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { Checklist } from "@/components/cinco-s/Checklist";
import { FormReabrir } from "@/components/cinco-s/FormReabrir";
import {
  getContexto5S,
  listarPerguntas,
  nomesDe,
  podeResponder,
  podeVerAuditoria,
} from "@/lib/cinco-s-server";
import {
  COR_STATUS_NC,
  EMOJI_SENSO,
  ROTULO_SENSO,
  ROTULO_STATUS_NC,
  SENSOS,
  formatarTaxa,
  resumoAuditoria,
  type Resposta,
  type Senso,
  type StatusNC,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/**
 * Uma auditoria: o checklist enquanto está aberta, o resultado depois de
 * finalizada.
 *
 * A checagem de acesso acontece aqui e de novo dentro de cada ação de
 * servidor. Não é paranoia repetida: esta página protege a TELA, e uma
 * server action é um endereço que dá para chamar sem passar por tela
 * nenhuma.
 */
export default async function AuditoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ctx = await getContexto5S();
  if (!ctx) redirect("/");
  if (!ctx.temAcesso) {
    redirect(
      `/?erro=${encodeURIComponent(
        "Você não participa do Programa 5S. Fale com o Admin do app.",
      )}`,
    );
  }

  const admin = createAdminClient();

  const { data: auditoria } = await admin
    .from("cinco_s_auditorias")
    .select(
      "id, area_id, auditor_id, dono_id, status, planejada_para, iniciada_em, finalizada_em, observacao, total_ok, total_nok, total_na, conformidade, cinco_s_areas!inner(nome, local)",
    )
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();

  if (!auditoria) notFound();
  if (!podeVerAuditoria(ctx, auditoria)) {
    redirect(
      `/5s?erro=${encodeURIComponent("Esta auditoria não está no seu acesso.")}`,
    );
  }

  const area = (
    Array.isArray(auditoria.cinco_s_areas)
      ? auditoria.cinco_s_areas[0]
      : auditoria.cinco_s_areas
  ) as { nome: string; local: string | null };

  const finalizada = auditoria.status === "finalizada";

  // As três leituras que a tela precisa, em paralelo. Sequenciais
  // somariam a latência de três idas ao banco por abertura.
  const [perguntas, { data: respostas }, { data: ncs }] = await Promise.all([
    listarPerguntas(ctx.revendaId),
    admin
      .from("cinco_s_respostas")
      .select("pergunta_id, valor, observacao, foto_url")
      .eq("auditoria_id", id),
    finalizada
      ? admin
          .from("cinco_s_nao_conformidades")
          .select("id, senso, descricao, status, prazo, responsavel_id")
          .eq("auditoria_id", id)
          .order("senso")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const nomes = await nomesDe(
    Array.from(
      new Set(
        [
          auditoria.auditor_id,
          auditoria.dono_id,
          ...(ncs ?? []).map((n) => n.responsavel_id),
        ].filter((x): x is string => Boolean(x)),
      ),
    ),
  );

  const editavel = podeResponder(ctx, auditoria);

  return (
    <div>
      <PageHeader
        title={area.nome}
        subtitle={`Auditoria 5S · ${auditoria.planejada_para
          .split("-")
          .reverse()
          .join("/")} · ${nomes.get(auditoria.auditor_id) ?? "—"}`}
      />

      {finalizada ? (
        <ResultadoFinal
          auditoria={auditoria}
          respostas={(respostas ?? []) as RespostaLinha[]}
          perguntas={perguntas}
          ncs={(ncs ?? []) as NCLinha[]}
          nomes={nomes}
          donoNome={
            auditoria.dono_id ? (nomes.get(auditoria.dono_id) ?? null) : null
          }
          podeReabrir={ctx.podeEditar}
        />
      ) : editavel ? (
        <Checklist
          auditoriaId={id}
          areaNome={area.nome}
          perguntas={perguntas}
          respostasIniciais={(respostas ?? []).map((r) => ({
            pergunta_id: r.pergunta_id,
            valor: r.valor as Resposta,
            observacao: r.observacao,
            foto_url: r.foto_url,
          }))}
          somenteLeitura={false}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            Esta auditoria está com{" "}
            <strong>{nomes.get(auditoria.auditor_id) ?? "outro auditor"}</strong>{" "}
            e ainda não foi finalizada.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {respostas?.length ?? 0} de {perguntas.length} itens respondidos.
          </p>
          <Link
            href="/5s"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            Voltar ao 5S
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type RespostaLinha = {
  pergunta_id: string;
  valor: Resposta;
  observacao: string | null;
  foto_url: string | null;
};

type NCLinha = {
  id: string;
  senso: Senso;
  descricao: string;
  status: StatusNC;
  prazo: string | null;
  responsavel_id: string | null;
};

function ResultadoFinal({
  auditoria,
  respostas,
  perguntas,
  ncs,
  nomes,
  donoNome,
  podeReabrir,
}: {
  auditoria: {
    id: string;
    total_ok: number;
    total_nok: number;
    total_na: number;
    conformidade: number | null;
    finalizada_em: string | null;
  };
  respostas: RespostaLinha[];
  perguntas: { id: string; senso: Senso; codigo: string; texto: string }[];
  ncs: NCLinha[];
  nomes: Map<string, string>;
  donoNome: string | null;
  podeReabrir: boolean;
}) {
  const mapa = new Map(respostas.map((r) => [r.pergunta_id, r]));

  // O resultado por senso é recalculado aqui, a partir das respostas que
  // a página já carregou -- e não com mais uma consulta. Bater com o
  // consolidado do banco é garantido porque a fórmula é a mesma.
  const porSenso = SENSOS.map((s) => {
    const doSenso = perguntas.filter((p) => p.senso === s);
    let ok = 0;
    let nok = 0;
    let na = 0;
    for (const p of doSenso) {
      const v = mapa.get(p.id)?.valor;
      if (v === "sim") ok++;
      else if (v === "nao") nok++;
      else if (v === "na") na++;
    }
    const avaliados = ok + nok;
    return {
      senso: s,
      ok,
      nok,
      na,
      taxa: avaliados === 0 ? null : Math.round((ok / avaliados) * 1000) / 10,
    };
  }).filter((s) => s.ok + s.nok + s.na > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Conformidade da área
        </p>
        <p className="text-4xl font-bold text-primary">
          {formatarTaxa(auditoria.conformidade)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {resumoAuditoria(auditoria)}
        </p>
        {donoNome && (
          <p className="mt-2 text-xs text-slate-400">
            Responsável pela área: {donoNome}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Resultado por senso
        </h2>
        <ul className="space-y-2.5">
          {porSenso.map((s) => (
            <li key={s.senso}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-slate-600">
                  <span aria-hidden="true">{EMOJI_SENSO[s.senso]}</span>{" "}
                  {ROTULO_SENSO[s.senso]}
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-700">
                  {s.taxa === null ? "—" : `${s.taxa.toFixed(0)}%`}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    (s.taxa ?? 0) >= 90
                      ? "bg-green-500"
                      : (s.taxa ?? 0) >= 70
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${s.taxa ?? 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {ncs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Não conformidades
              <span className="ml-2 font-normal text-slate-400">
                ({ncs.length})
              </span>
            </h2>
            <Link
              href="/5s/acoes"
              className="text-xs font-semibold text-primary underline"
            >
              Plano de ação
            </Link>
          </div>
          <ul className="space-y-2">
            {ncs.map((n) => (
              <li key={n.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-slate-700">
                    {n.descricao}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_STATUS_NC[n.status]}`}
                  >
                    {ROTULO_STATUS_NC[n.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {ROTULO_SENSO[n.senso]}
                  {n.responsavel_id &&
                    ` · ${nomes.get(n.responsavel_id) ?? "—"}`}
                  {n.prazo && ` · até ${n.prazo.split("-").reverse().join("/")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Todas as respostas
            <span className="ml-2 font-normal text-slate-400">
              ({perguntas.length})
            </span>
          </h2>
          <span className="text-slate-400 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {perguntas.map((p) => {
            const r = mapa.get(p.id);
            return (
              <li key={p.id} className="p-3">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${
                      r?.valor === "sim"
                        ? "bg-green-100 text-green-700"
                        : r?.valor === "nao"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r?.valor === "sim" ? "OK" : r?.valor === "nao" ? "NOK" : "N/A"}
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-snug text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {p.codigo}
                    </span>{" "}
                    {p.texto}
                  </p>
                </div>
                {r?.observacao && (
                  <p className="mt-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-500">
                    {r.observacao}
                  </p>
                )}
                {r?.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.foto_url}
                    alt={`Evidência do item ${p.codigo}`}
                    className="mt-2 h-28 w-full rounded-xl object-cover"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </details>

      {podeReabrir && <Reabrir auditoriaId={auditoria.id} />}

      <p className="text-center text-xs text-slate-400">
        Finalizada em{" "}
        {auditoria.finalizada_em
          ? new Date(auditoria.finalizada_em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
      </p>
    </div>
  );
}

/**
 * Reabertura.
 *
 * Fica recolhida e exige um motivo escrito: alterar auditoria finalizada
 * é permitido, mas nunca por acidente, e sempre com rastro no log de
 * auditoria do app.
 */
function Reabrir({ auditoriaId }: { auditoriaId: string }) {
  return (
    <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-amber-900">
        Precisa corrigir esta auditoria?
      </summary>
      <p className="mt-2 text-xs text-amber-800">
        Reabrir permite trocar respostas. O consolidado é recalculado e a
        reabertura fica registrada no Log de Auditoria com o seu nome.
      </p>
      <FormReabrir auditoriaId={auditoriaId} />
    </details>
  );
}
