import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  TURNOS,
  diasAtrasISO,
  formatarDataHora,
  hojeISO,
  turnoAtual,
} from "@/lib/produtividade-armazem";
import { encerrarPicking, iniciarPicking } from "./actions";

export const dynamic = "force-dynamic";

type Aba = "lancar" | "historico";

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
  const perfil = await requireAcessoModulo("pa-picking");

  const sp = await searchParams;
  const aba: Aba = sp.aba === "historico" ? "historico" : "lancar";
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const colab = (sp.colab ?? "").trim();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: aberto }, { data: doPeriodo }] = await Promise.all([
    supabase
      .from("pa_reabastecimentos_picking")
      .select("id, colaborador_id, colaborador_nome, turno, inicio, fim, area, posicoes_reabastecidas, observacao")
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id)
      .is("fim", null)
      .maybeSingle(),
    aba === "historico"
      ? (() => {
          let q = supabase
            .from("pa_reabastecimentos_picking")
            .select("id, colaborador_id, colaborador_nome, turno, inicio, fim, area, posicoes_reabastecidas, observacao")
            .eq("revenda_id", revendaId)
            .gte("inicio", `${de}T00:00:00`)
            .lte("inicio", `${ate}T23:59:59`)
            .not("fim", "is", null);
          if (colab) q = q.eq("colaborador_id", colab);
          return q.order("inicio", { ascending: false }).limit(300);
        })()
      : Promise.resolve({ data: null }),
  ]);

  const historico = (doPeriodo ?? []) as Registro[];
  const contadores = new Map<string, string>();
  for (const r of historico) contadores.set(r.colaborador_id, r.colaborador_nome);

  return (
    <div>
      <PageHeader
        title="Reabastecimento de Picking"
        subtitle="Registre início e fim do reabastecimento."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {(["lancar", "historico"] as Aba[]).map((a) => (
          <a
            key={a}
            href={`?aba=${a}`}
            aria-current={a === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a === aba
                ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a === "lancar" ? "Lançar" : "Histórico"}
          </a>
        ))}
      </nav>

      {aba === "lancar" &&
        (aberto ? (
          <form
            action={encerrarPicking}
            className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          >
            <input type="hidden" name="id" value={aberto.id} />
            <p className="text-sm font-bold text-amber-900">
              Reabastecimento em andamento desde {formatarDataHora(aberto.inicio)}
            </p>
            <div>
              <label className={rotulo} htmlFor="area">Área/endereço (opcional)</label>
              <input id="area" name="area" maxLength={200} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="posicoes_reabastecidas">Posições reabastecidas (opcional)</label>
              <input
                id="posicoes_reabastecidas"
                name="posicoes_reabastecidas"
                type="number"
                inputMode="numeric"
                min={0}
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
              <input id="observacao" name="observacao" maxLength={300} className={campo} />
            </div>
            <BotaoEnviar
              textoEnviando="Encerrando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Encerrar reabastecimento
            </BotaoEnviar>
          </form>
        ) : (
          <form action={iniciarPicking} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <span className={rotulo}>Turno</span>
              <div className="grid grid-cols-3 gap-2">
                {TURNOS.map((t) => (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-dark"
                  >
                    <input
                      type="radio"
                      name="turno"
                      value={t}
                      defaultChecked={t === turnoAtual()}
                      className="sr-only"
                    />
                    {ROTULO_TURNO[t]}
                  </label>
                ))}
              </div>
            </div>
            <BotaoEnviar
              textoEnviando="Iniciando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              🛒 Iniciar reabastecimento
            </BotaoEnviar>
          </form>
        ))}

      {aba === "historico" && (
        <section>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="aba" value="historico" />
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
      )}
    </div>
  );
}
