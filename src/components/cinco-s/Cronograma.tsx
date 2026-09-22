import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomesDe } from "@/lib/cinco-s-server";
import { faixaDaTaxa } from "@/lib/cinco-s";
import { CronogramaSvg, type CelulaCronograma } from "./CronogramaSvg";
import { ExportarMapa } from "./ExportarMapa";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Auditoria = {
  id: string;
  area_id: string;
  auditor_id: string;
  dono_id: string | null;
  status: string;
  planejada_para: string;
  finalizada_em: string | null;
  conformidade: number | string | null;
};

type Situacao = "feita" | "andamento" | "atrasada" | "agendada";

const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
function curto(n: string | undefined | null) {
  if (!n) return "—";
  const p = n.trim().split(/\s+/);
  const s = p.slice(1).find((x) => !PARTICULAS.has(x.toUpperCase()));
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  return s ? `${cap(p[0])} ${cap(s)}` : cap(p[0]);
}
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

/**
 * O CRONOGRAMA DE AUDITORIAS DO 5S (pedido do dono, 21/09/2026: "um local
 * onde eu veja o cronograma, as que já passaram e as que ainda estão por vir
 * e já estão marcadas"). Um quadro área × mês do ano -- a nota nas feitas,
 * a data nas agendadas, o alerta nas atrasadas -- e a lista das próximas.
 * A checagem de acesso fica na página (app/5s/cronograma).
 */
export async function Cronograma({ revendaId, anoPedido }: { revendaId: string; anoPedido: number }) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Number.isInteger(anoPedido) && anoPedido > 2000 && anoPedido < 2100 ? anoPedido : anoAtual;
  const mesAtual = ano === anoAtual ? Number(hoje.slice(5, 7)) : 0;
  const ctx = { revendaId };

  const admin = createAdminClient();
  const [{ data: linhas }, { data: areasBanco }] = await Promise.all([
    admin
      .from("cinco_s_auditorias")
      .select("id, area_id, auditor_id, dono_id, status, planejada_para, finalizada_em, conformidade")
      .eq("revenda_id", ctx.revendaId)
      .neq("status", "cancelada")
      .gte("planejada_para", `${ano}-01-01`)
      .lte("planejada_para", `${ano}-12-31`)
      .order("planejada_para"),
    admin.from("cinco_s_areas").select("id, nome, ativa").eq("revenda_id", ctx.revendaId),
  ]);
  const auditorias = (linhas ?? []) as Auditoria[];
  const nomes = await nomesDe([...new Set(auditorias.flatMap((a) => [a.auditor_id, a.dono_id]).filter((x): x is string => Boolean(x)))]);
  const nomeDaArea = new Map((areasBanco ?? []).map((a) => [a.id as string, a.nome as string]));

  const situacao = (a: Auditoria): Situacao =>
    a.status === "finalizada" ? "feita" : a.status === "em_andamento" ? "andamento" : a.planejada_para < hoje ? "atrasada" : "agendada";

  // Linhas do quadro: as áreas que têm auditoria no ano, em ordem alfabética.
  const areaIds = [...new Set(auditorias.map((a) => a.area_id))].sort((x, y) =>
    (nomeDaArea.get(x) ?? "").localeCompare(nomeDaArea.get(y) ?? "", "pt-BR"),
  );
  const celula = new Map<string, Auditoria>(); // "área|mês"
  for (const a of auditorias) celula.set(`${a.area_id}|${Number(a.planejada_para.slice(5, 7))}`, a);

  const feitas = auditorias.filter((a) => situacao(a) === "feita").length;
  const agendadas = auditorias.filter((a) => situacao(a) === "agendada");
  const atrasadas = auditorias.filter((a) => situacao(a) === "atrasada" || situacao(a) === "andamento");
  const proximas = agendadas.slice(0, 60);
  const porMes = new Map<number, Auditoria[]>();
  for (const a of proximas) {
    const m = Number(a.planejada_para.slice(5, 7));
    porMes.set(m, [...(porMes.get(m) ?? []), a]);
  }

  // A mesma grade, com as cores em hexadecimal, para a imagem (CronogramaSvg).
  const HEX = {
    boa: { fundo: "#ECFDF5", cor: "#065F46" },
    atencao: { fundo: "#FFFBEB", cor: "#92400E" },
    critica: { fundo: "#FEF2F2", cor: "#B91C1C" },
    vazia: { fundo: "#F8FAFC", cor: "#64748B" },
    agendada: { fundo: "#F0F9FF", cor: "#075985" },
    andamento: { fundo: "#FEF3C7", cor: "#92400E" },
    atrasada: { fundo: "#FEE2E2", cor: "#B91C1C" },
  } as const;
  const celulasSvg: CelulaCronograma[][] = areaIds.map((areaId) =>
    MESES.map((_, i) => {
      const a = celula.get(`${areaId}|${i + 1}`);
      if (!a) return null;
      const s = situacao(a);
      const nota = a.conformidade == null ? null : Number(a.conformidade);
      if (s === "feita") return { texto: nota == null ? "✓" : `${Math.round(nota)}%`, ...HEX[faixaDaTaxa(nota)] };
      if (s === "agendada") return { texto: `dia ${dataBr(a.planejada_para).slice(0, 2)}`, ...HEX.agendada };
      if (s === "andamento") return { texto: "em and.", ...HEX.andamento };
      return { texto: "atras.", ...HEX.atrasada };
    }),
  );

  const corDaNota = (n: number | null) => {
    const f = faixaDaTaxa(n);
    return f === "boa" ? "bg-emerald-50 text-emerald-800" : f === "atencao" ? "bg-amber-50 text-amber-800" : f === "critica" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500";
  };

  return (
    <div>
      <PageHeader title="📅 Cronograma de auditorias" subtitle={`Programa 5S · ${ano}`} fecharHref="/5s" />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/5s/cronograma?ano=${ano - 1}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
          ← {ano - 1}
        </Link>
        <span className="text-sm font-bold text-slate-800">{ano}</span>
        <Link href={`/5s/cronograma?ano=${ano + 1}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
          {ano + 1} →
        </Link>
      </div>

      {/* ---- Resumo ---- */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Numero valor={feitas} rotulo="realizadas" classe="text-emerald-700" />
        <Numero valor={agendadas.length} rotulo="agendadas" classe="text-primary-dark" />
        <Numero valor={atrasadas.length} rotulo="atrasadas / em andamento" classe={atrasadas.length ? "text-red-600" : "text-slate-500"} />
      </div>

      {auditorias.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nenhuma auditoria planejada em {ano}.
        </p>
      ) : (
        <>
          {/* ---- O quadro área × mês ---- */}
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Área × mês</h2>
                <ExportarMapa
                  alvoId="cronograma-5s-svg"
                  titulo={`Cronograma de auditorias 5S — ${ano}`}
                  arquivo={`cronograma-5s-${ano}.png`}
                />
              </div>
              <CronogramaSvg
                id="cronograma-5s-svg"
                areas={areaIds.map((a) => nomeDaArea.get(a) ?? "—")}
                celulas={celulasSvg}
                mesAtual={mesAtual}
              />
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800">nota = realizada</span>
                <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800">dia = agendada</span>
                <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">atrasada</span>
              </div>
            </div>
            <div className="rolagem-lateral -mx-3 overflow-x-auto px-3">
              <table className="w-full min-w-[620px] border-separate border-spacing-0.5 text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-semibold text-slate-500">Área</th>
                    {MESES.map((m, i) => (
                      <th
                        key={m}
                        className={`px-1 py-1.5 text-center font-semibold ${i + 1 === mesAtual ? "rounded bg-primary text-white" : "text-slate-500"}`}
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areaIds.map((areaId) => (
                    <tr key={areaId}>
                      <td className="sticky left-0 z-10 max-w-[8.5rem] truncate bg-white px-1.5 py-1 font-medium text-slate-800">
                        {nomeDaArea.get(areaId) ?? "—"}
                      </td>
                      {MESES.map((_, i) => {
                        const a = celula.get(`${areaId}|${i + 1}`);
                        if (!a) return <td key={i} className="rounded bg-slate-50/60" />;
                        const s = situacao(a);
                        const nota = a.conformidade == null ? null : Number(a.conformidade);
                        const titulo = `${nomeDaArea.get(areaId)} · ${MESES_LONGOS[i]} · auditor: ${nomes.get(a.auditor_id) ?? "—"}${a.dono_id ? ` · dono: ${nomes.get(a.dono_id) ?? "—"}` : ""}`;
                        const classe =
                          s === "feita"
                            ? corDaNota(nota)
                            : s === "agendada"
                              ? "bg-sky-50 text-sky-800"
                              : s === "andamento"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-700";
                        return (
                          <td key={i} className="p-0">
                            <Link
                              href={`/5s/auditoria/${a.id}`}
                              title={titulo}
                              className={`block rounded px-1 py-1.5 text-center font-semibold tabular-nums hover:ring-1 hover:ring-primary ${classe}`}
                            >
                              {s === "feita" ? (nota == null ? "✓" : `${Math.round(nota)}%`) : s === "agendada" ? `dia ${dataBr(a.planejada_para).slice(0, 2)}` : s === "andamento" ? "em and." : "atras."}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Toque numa célula para abrir a auditoria. Passe o mouse para ver auditor e dono.</p>
          </section>

          {/* ---- Atrasadas ---- */}
          {atrasadas.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-red-600">Atrasadas ({atrasadas.length})</h2>
              <ListaDeAuditorias itens={atrasadas} nomes={nomes} nomeDaArea={nomeDaArea} destaque="atrasada" />
            </section>
          )}

          {/* ---- Próximas ---- */}
          <section>
            <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
              Próximas auditorias ({agendadas.length})
            </h2>
            {proximas.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma auditoria agendada para o resto do ano.</p>
            ) : (
              <div className="space-y-2">
                {/* Um mês por vez: só o primeiro abre sozinho -- 19 auditorias
                    por mês viram uma lista longa demais aberta de uma vez. */}
                {[...porMes].map(([m, itens], i) => (
                  <details key={m} open={i === 0} className="group rounded-2xl">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                      <span>
                        {MESES_LONGOS[m - 1]} · {itens.length} auditoria{itens.length === 1 ? "" : "s"}
                      </span>
                      <span className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">
                        ▾
                      </span>
                    </summary>
                    <div className="mt-2">
                      <ListaDeAuditorias itens={itens} nomes={nomes} nomeDaArea={nomeDaArea} destaque="agendada" />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Numero({ valor, rotulo, classe }: { valor: number; rotulo: string; classe: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${classe}`}>{valor}</p>
      <p className="text-[11px] text-slate-500">{rotulo}</p>
    </div>
  );
}

function ListaDeAuditorias({
  itens,
  nomes,
  nomeDaArea,
  destaque,
}: {
  itens: Auditoria[];
  nomes: Map<string, string>;
  nomeDaArea: Map<string, string>;
  destaque: "agendada" | "atrasada";
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {itens.map((a) => (
        <li key={a.id}>
          <Link href={`/5s/auditoria/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-50">
            <span
              className={`w-12 shrink-0 rounded-lg px-1 py-1 text-center text-xs font-bold tabular-nums ${
                destaque === "atrasada" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"
              }`}
            >
              {dataBr(a.planejada_para)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{nomeDaArea.get(a.area_id) ?? "—"}</span>
              <span className="block truncate text-xs text-slate-500">
                auditor: {curto(nomes.get(a.auditor_id))}
                {a.dono_id && ` → dono: ${curto(nomes.get(a.dono_id))}`}
              </span>
            </span>
            <span className="shrink-0 text-slate-300" aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
