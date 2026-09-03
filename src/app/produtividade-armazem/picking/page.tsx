import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  diasAtrasISO,
  formatarDataHora,
  hojeISO,
} from "@/lib/produtividade-armazem";

export const dynamic = "force-dynamic";

/**
 * ARQUIVO -- esta tela não lança mais nada desde 29/08/2026.
 *
 * Ela media "posições reabastecidas", campo que ficou nulo em 100% das
 * sessões que a operação lançou: ninguém consegue contar posição no meio
 * do corredor. Quem abastece picking agora usa
 * /produtividade-armazem/abastecimento, que pede produto e quantidade e
 * calcula o HL sozinho.
 *
 * A rota fica de pé só de leitura para o histórico não sumir -- e por
 * isso saiu da vitrine, sem virar um segundo módulo medindo a mesma
 * atividade (foi o que aconteceu com o "Recebimento de Paletes").
 */

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Registro = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  turno: string;
  inicio: string;
  fim: string | null;
  area: string | null;
  posicoes_reabastecidas: number | null;
  observacao: string | null;
};

export default async function PickingPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; de?: string; ate?: string; colab?: string; erro?: string; sucesso?: string }>;
}) {
  await requireAcessoModulo("pa-picking");

  const sp = await searchParams;
  const de = sp.de ?? diasAtrasISO(90);
  const ate = sp.ate ?? hojeISO();
  const colab = (sp.colab ?? "").trim();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  let consulta = supabase
    .from("pa_reabastecimentos_picking")
    .select("id, colaborador_id, colaborador_nome, turno, inicio, fim, area, posicoes_reabastecidas, observacao")
    .eq("revenda_id", revendaId)
    // O dia digitado é o da operação (UTC-3), não o do servidor -- a
    // Vercel roda em UTC.
    .gte("inicio", `${de}T00:00:00-03:00`)
    .lte("inicio", `${ate}T23:59:59-03:00`)
    .not("fim", "is", null);
  if (colab) consulta = consulta.eq("colaborador_id", colab);
  const { data: doPeriodo } = await consulta.order("inicio", { ascending: false }).limit(300);

  const historico = (doPeriodo ?? []) as Registro[];
  const contadores = new Map<string, string>();
  for (const r of historico) contadores.set(r.colaborador_id, r.colaborador_nome);

  return (
    <div>
      <PageHeader
        title="Picking — registros antigos"
        subtitle="Arquivo do modelo anterior, por posições. Só leitura."
        fecharHref="/produtividade-armazem"
      />

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-900">Esta tela não recebe mais lançamentos</p>
        <p className="mt-1 text-xs text-amber-800">
          O abastecimento do picking agora é lançado por produto e quantidade, e o app calcula o HL sozinho.
          Estes registros ficam aqui só para consulta.
        </p>
        <Link
          href="/produtividade-armazem/abastecimento"
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          🏬 Ir para o Abastecimento do Picking
        </Link>
      </div>

      <section>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label className={rotulo} htmlFor="de">De</label>
              <input id="de" type="date" name="de" defaultValue={de} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="ate">Até</label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className={rotulo} htmlFor="colab">Colaborador</label>
              <select id="colab" name="colab" defaultValue={colab} className={campo}>
                <option value="">Todos</option>
                {[...contadores].map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
              Filtrar
            </button>
          </form>

          {historico.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum reabastecimento encerrado no período.
            </p>
          ) : (
            <ul className="space-y-2">
              {historico.map((r) => {
                const minutos = r.fim
                  ? Math.round((new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 60000)
                  : null;
                return (
                  <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {r.colaborador_nome} · {ROTULO_TURNO[r.turno as keyof typeof ROTULO_TURNO] ?? r.turno}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatarDataHora(r.inicio)} – {r.fim ? formatarDataHora(r.fim) : "—"}
                      {minutos !== null && ` (${minutos} min)`}
                      {r.area && ` — ${r.area}`}
                      {r.posicoes_reabastecidas !== null && ` — ${r.posicoes_reabastecidas} posições`}
                    </p>
                    {r.observacao && <p className="mt-1 text-xs text-slate-500">{r.observacao}</p>}
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
