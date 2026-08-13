import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import {
  FORMATOS,
  TIPOS,
  chave,
  fatoresDeLinhas,
  parqueDeLinhas,
} from "@/lib/ativo-giro";
import { salvarFator, salvarParque } from "./actions";
import { ImportarHistorico } from "./ImportarHistorico";

export const dynamic = "force-dynamic";

export default async function AdminAtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("ativo-giro", "editar");

  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: fatoresBanco }, { data: parqueBanco }] = await Promise.all([
    supabase.from("ag_fatores").select("formato, palete, lastro"),
    supabase.from("ag_parque").select("tipo, formato, quantidade"),
  ]);
  const fatores = fatoresDeLinhas(fatoresBanco);
  const parque = parqueDeLinhas(parqueBanco);

  return (
    <div>
      <PageHeader
        title="Ativo de Giro — Configuração"
        subtitle="Parque e fatores de conversão. Quem tem acesso ao módulo se gerencia em Colaboradores."
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {sp.erro}
        </p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          {sp.sucesso}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        <a
          href="/ativo-de-giro"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Ir para contagem, painel, conciliação e histórico
        </a>
        <a
          href="/admin/colaboradores"
          className="text-sm font-medium text-primary hover:underline"
        >
          Gerenciar quem tem acesso →
        </a>
      </div>

      <section className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
            Parque de AG (saldo oficial, em caixas)
          </h2>
          <div className="space-y-2">
            {TIPOS.flatMap((tipo) =>
              FORMATOS.map((formato) => (
                <form
                  key={chave(tipo, formato)}
                  action={salvarParque}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="tipo" value={tipo} />
                  <input type="hidden" name="formato" value={formato} />
                  <span className="flex-1 text-sm text-slate-700">
                    {tipo} · {formato}
                  </span>
                  <input
                    type="number"
                    name="quantidade"
                    min={0}
                    defaultValue={parque[chave(tipo, formato)] ?? 0}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                  />
                  <BotaoEnviar
                    compacto
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Salvar
                  </BotaoEnviar>
                </form>
              )),
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
            Fatores de conversão
          </h2>
          <div className="space-y-2">
            {FORMATOS.map((formato) => (
              <form
                key={formato}
                action={salvarFator}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="formato" value={formato} />
                <span className="flex-1 text-sm text-slate-700">
                  {formato}
                </span>
                <input
                  type="number"
                  name="palete"
                  min={1}
                  defaultValue={fatores[formato].palete}
                  aria-label={`Caixas por palete ${formato}`}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                />
                <input
                  type="number"
                  name="lastro"
                  min={1}
                  defaultValue={fatores[formato].lastro}
                  aria-label={`Caixas por lastro ${formato}`}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                />
                <BotaoEnviar
                  compacto
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Salvar
                </BotaoEnviar>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Primeiro campo: caixas por palete. Segundo: caixas por lastro.
          </p>
        </div>

        <ImportarHistorico />
      </section>
    </div>
  );
}
