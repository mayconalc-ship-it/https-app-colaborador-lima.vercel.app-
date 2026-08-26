import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import type { Fabrica, Transportadora } from "@/lib/produtividade-armazem";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { ROTULO_STATUS, calcularTmaMinutos, formatarMinutos, type AtendimentoCarreta } from "@/lib/carretas";
import { FormPortaria } from "./FormPortaria";

export const dynamic = "force-dynamic";

type Aba = "lancar" | "historico";

type LinhaBanco = {
  id: string;
  numero_dt: string;
  motorista_nome: string;
  placa_carreta: string;
  chegada_em: string;
  agendamento_em: string | null;
  carga_agendada: boolean;
  status: AtendimentoCarreta["status"];
  fim_descarga_em: string | null;
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

function nomeRelacionado(v: { nome: string } | { nome: string }[] | null) {
  if (!v) return "—";
  return Array.isArray(v) ? (v[0]?.nome ?? "—") : v.nome;
}

export default async function CarretasPortariaPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string }>;
}) {
  await requireAcessoModulo("carretas-portaria");

  const sp = await searchParams;
  const aba: Aba = sp.aba === "historico" ? "historico" : "lancar";

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: fabricasBanco }, { data: transportadorasBanco }, { data: historicoBanco }] = await Promise.all([
    supabase.from("pa_fabricas").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
    supabase.from("pa_transportadoras").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
    aba === "historico"
      ? supabase
          .from("atendimentos_carretas")
          .select(
            "id, numero_dt, motorista_nome, placa_carreta, chegada_em, agendamento_em, carga_agendada, status, fim_descarga_em, pa_fabricas(nome), pa_transportadoras(nome)",
          )
          .eq("revenda_id", revendaId)
          .order("chegada_em", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
  ]);

  const fabricas: Fabrica[] = fabricasBanco ?? [];
  const transportadoras: Transportadora[] = transportadorasBanco ?? [];
  const historico = (historicoBanco ?? []) as unknown as LinhaBanco[];

  return (
    <div>
      <PageHeader title="👮 Recebimento de Carreta" subtitle="Registre a chegada assim que a carreta entrar." />

      <a
        href="/produtividade-armazem"
        className="mb-2 inline-flex text-sm font-medium text-primary hover:underline"
      >
        ← Produtividade do Armazém
      </a>
      <Link
        href="/carretas-conferencia"
        className="mb-4 ml-4 inline-flex text-sm font-medium text-primary hover:underline"
      >
        🖥️ Ir para o Monitor de Recebimento →
      </Link>

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>}

      <nav className="mb-4 flex flex-wrap gap-2">
        {(["lancar", "historico"] as Aba[]).map((a) => (
          <a
            key={a}
            href={`?aba=${a}`}
            aria-current={a === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a === aba ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a === "lancar" ? "Lançar" : "Histórico"}
          </a>
        ))}
      </nav>

      {aba === "lancar" &&
        (fabricas.length === 0 || transportadoras.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Cadastre fábricas e transportadoras em Produtividade do Armazém → Configuração antes
            de lançar uma chegada.
          </p>
        ) : (
          <FormPortaria fabricas={fabricas} transportadoras={transportadoras} />
        ))}

      {aba === "historico" &&
        (historico.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma chegada registrada ainda.</p>
        ) : (
          <ul className="space-y-3">
            {historico.map((h) => {
              const tma =
                h.status === "finalizado" && h.fim_descarga_em
                  ? calcularTmaMinutos({
                      chegadaEm: h.chegada_em,
                      agendamentoEm: h.agendamento_em,
                      cargaAgendada: h.carga_agendada,
                      fimDescargaEm: h.fim_descarga_em,
                    } as AtendimentoCarreta)
                  : null;
              return (
                <li key={h.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {nomeRelacionado(h.pa_fabricas)} → {nomeRelacionado(h.pa_transportadoras)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatarDataHora(h.chegada_em)} — DT {h.numero_dt} — Carreta {h.placa_carreta} — {h.motorista_nome}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {ROTULO_STATUS[h.status]}
                    </span>
                  </div>
                  {tma !== null && (
                    <p className="mt-2 text-xs font-semibold text-primary">TMA: {formatarMinutos(tma)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
