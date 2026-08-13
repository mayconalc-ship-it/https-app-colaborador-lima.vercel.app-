import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MODULOS } from "@/lib/acessos";
import {
  alternarRevenda,
  criarRevenda,
  renomearRevenda,
  salvarModulos,
} from "./actions";

export default async function RevendasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireOwner();
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();

  const [{ data: revendas }, { data: modulos }, { data: vinculos }] =
    await Promise.all([
      admin.from("revendas").select("id, slug, nome, ativa").order("ordem"),
      admin.from("revenda_modulos").select("revenda_id, modulo").eq("ativo", true),
      admin.from("colaborador_revendas").select("revenda_id"),
    ]);

  const modulosPorRevenda = new Map<string, Set<string>>();
  for (const m of modulos ?? []) {
    if (!modulosPorRevenda.has(m.revenda_id)) {
      modulosPorRevenda.set(m.revenda_id, new Set());
    }
    modulosPorRevenda.get(m.revenda_id)!.add(m.modulo);
  }

  const pessoasPorRevenda = new Map<string, number>();
  for (const v of vinculos ?? []) {
    pessoasPorRevenda.set(
      v.revenda_id,
      (pessoasPorRevenda.get(v.revenda_id) ?? 0) + 1,
    );
  }

  const grupos = ["Conteúdo do app", "Pessoas e configuração"] as const;

  return (
    <div>
      <PageHeader
        title="🏢 Revendas"
        subtitle="Quais unidades existem e o que cada uma usa do app"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <div className="mb-4 rounded-2xl border border-gold bg-gold-soft p-4">
        <p className="text-xs text-primary-dark">
          Desligar um módulo aqui o esconde para a revenda inteira — inclusive
          para você e para as lideranças que já tinham permissão nele. Nada é
          apagado: religando, tudo volta como estava.
        </p>
      </div>

      {/* ---- Nova revenda ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Cadastrar revenda
        </summary>
        <form action={criarRevenda} className="border-t border-slate-100 p-4">
          <label
            htmlFor="nome-nova"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Nome da revenda
          </label>
          <input
            id="nome-nova"
            name="nome"
            placeholder="Revenda Lima ..."
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            required
            minLength={3}
          />
          <BotaoEnviar
            textoEnviando="Cadastrando..."
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Cadastrar
          </BotaoEnviar>
          <p className="mt-2 text-xs text-slate-400">
            A revenda nasce sem nenhum módulo e sem ninguém vinculado. Os
            colaboradores você liga na tela de Colaboradores.
          </p>
        </form>
      </details>

      <div className="space-y-3">
        {(revendas ?? []).map((r) => {
          const meus = modulosPorRevenda.get(r.id) ?? new Set<string>();
          const pessoas = pessoasPorRevenda.get(r.id) ?? 0;

          return (
            <details
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <summary className="cursor-pointer p-4">
                <span className="font-semibold text-slate-800">{r.nome}</span>
                {!r.ativa && (
                  <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                    desativada
                  </span>
                )}
                <span className="ml-2 text-xs text-slate-400">
                  {meus.size} módulo(s) · {pessoas} pessoa(s)
                </span>
              </summary>

              {/* ---- Módulos ---- */}
              <form
                action={salvarModulos}
                className="border-t border-slate-100 p-4"
              >
                <input type="hidden" name="id" value={r.id} />

                <div className="space-y-4">
                  {grupos.map((grupo) => (
                    <div key={grupo}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {grupo}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {MODULOS.filter((m) => m.grupo === grupo).map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name="modulo"
                              value={m.id}
                              defaultChecked={meus.has(m.id)}
                              className="h-4 w-4 rounded border-slate-300 text-primary"
                            />
                            {m.emoji} {m.rotulo}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <BotaoEnviar
                  textoEnviando="Salvando..."
                  className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Salvar módulos de {r.nome}
                </BotaoEnviar>
              </form>

              {/* ---- Nome ---- */}
              <form
                action={renomearRevenda}
                className="flex gap-2 border-t border-slate-100 p-4"
              >
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="nome"
                  defaultValue={r.nome}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                  required
                  minLength={3}
                />
                <BotaoEnviar
                  compacto
                  className="shrink-0 rounded-xl border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-primary-soft"
                >
                  Renomear
                </BotaoEnviar>
              </form>

              {/* ---- Ativa / desativada ---- */}
              <form action={alternarRevenda} className="border-t border-slate-100 p-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="ativa" value={r.ativa ? "0" : "1"} />
                <BotaoEnviar
                  textoEnviando="Aplicando..."
                  className={
                    r.ativa
                      ? "w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                      : "w-full rounded-xl border border-primary py-3 text-sm font-medium text-primary hover:bg-primary-soft"
                  }
                >
                  {r.ativa ? `Desativar ${r.nome}` : `Reativar ${r.nome}`}
                </BotaoEnviar>
                <p className="mt-2 text-xs text-slate-400">
                  Desativar não apaga nada. A revenda some da lista de quem
                  está vinculado a ela, e o histórico continua guardado.
                </p>
              </form>
            </details>
          );
        })}
      </div>
    </div>
  );
}
