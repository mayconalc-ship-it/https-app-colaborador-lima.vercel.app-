import { PageHeader } from "@/components/PageHeader";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehOwner } from "@/lib/acessos";
import {
  FORMATOS,
  TIPOS,
  chave,
  fatoresDeLinhas,
  parqueDeLinhas,
} from "@/lib/ativo-giro";
import {
  salvarFator,
  salvarParque,
  concederAcessoAtivoGiro,
  revogarAcessoAtivoGiro,
} from "./actions";
import { ImportarHistorico } from "./ImportarHistorico";

export const dynamic = "force-dynamic";

type Aba = "config" | "acessos";

export default async function AdminAtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireModulo("ativo-giro", "ver");
  const souOwner = ehOwner(perfil.role);
  const podeEditar = await podeNoModulo("ativo-giro", "editar");

  const ABAS: { id: Aba; rotulo: string }[] = [
    ...(podeEditar ? [{ id: "config" as Aba, rotulo: "Configuração" }] : []),
    ...(souOwner ? [{ id: "acessos" as Aba, rotulo: "Acessos" }] : []),
  ];

  const sp = await searchParams;
  const aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? ABAS[0]?.id) as
    | Aba
    | undefined;

  let fatores = null as ReturnType<typeof fatoresDeLinhas> | null;
  let parque = null as ReturnType<typeof parqueDeLinhas> | null;
  if (aba === "config") {
    const supabase = await createClient();
    const [{ data: fatoresBanco }, { data: parqueBanco }] = await Promise.all([
      supabase.from("ag_fatores").select("formato, palete, lastro"),
      supabase.from("ag_parque").select("tipo, formato, quantidade"),
    ]);
    fatores = fatoresDeLinhas(fatoresBanco);
    parque = parqueDeLinhas(parqueBanco);
  }

  // Só busca a lista de colaboradores/acessos quando a aba está aberta e a
  // pessoa é o dono -- é a única que pode conceder ou revogar.
  let colaboradores: { id: string; nome: string; cpf: string }[] = [];
  let liberados = new Set<string>();
  if (aba === "acessos" && souOwner) {
    const admin = createAdminClient();
    const [{ data: pessoas }, { data: acessos }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, nome, cpf")
        .eq("role", "colaborador")
        .order("nome", { ascending: true }),
      admin
        .from("colaborador_modulos_extra")
        .select("colaborador_id")
        .eq("modulo", "ativo-giro"),
    ]);
    colaboradores = pessoas ?? [];
    liberados = new Set((acessos ?? []).map((a) => a.colaborador_id));
  }

  return (
    <div>
      <PageHeader
        title="Ativo de Giro — Configuração"
        subtitle="Parque, fatores de conversão e quem tem acesso ao módulo."
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

      <a
        href="/ativo-de-giro"
        className="mb-4 inline-flex text-sm font-medium text-primary hover:underline"
      >
        ← Ir para contagem, painel, conciliação e histórico
      </a>

      {ABAS.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Você não tem nada para configurar aqui.
        </p>
      ) : (
        <>
          {ABAS.length > 1 && (
            <nav className="mb-4 flex flex-wrap gap-2">
              {ABAS.map((a) => (
                <a
                  key={a.id}
                  href={`/admin/ativo-de-giro?aba=${a.id}`}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    a.id === aba
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {a.rotulo}
                </a>
              ))}
            </nav>
          )}

          {aba === "config" && fatores && parque && (
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
                        <button
                          type="submit"
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Salvar
                        </button>
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
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Salvar
                      </button>
                    </form>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Primeiro campo: caixas por palete. Segundo: caixas por lastro.
                </p>
              </div>

              <ImportarHistorico />
            </section>
          )}

          {aba === "acessos" && souOwner && (
            <section>
              <p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Por padrão, nenhum colaborador vê o Ativo de Giro no menu.
                Libere abaixo quem pode lançar contagem, ver o painel, a
                conciliação e o histórico do time.
              </p>
              {colaboradores.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhum colaborador cadastrado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {colaboradores.map((c) => {
                    const liberado = liberados.has(c.id);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {c.nome}
                          </p>
                          <p className="text-xs text-slate-500">{c.cpf}</p>
                        </div>
                        <form
                          action={
                            liberado
                              ? revogarAcessoAtivoGiro
                              : concederAcessoAtivoGiro
                          }
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className={
                              liberado
                                ? "shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                                : "shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
                            }
                          >
                            {liberado ? "Revogar acesso" : "Liberar acesso"}
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
