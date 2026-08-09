import { PageHeader } from "@/components/PageHeader";
import { requireModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehOwner } from "@/lib/acessos";
import {
  FORMATOS,
  TIPOS,
  chave,
  conciliar,
  diasAtrasISO,
  fatoresDeLinhas,
  formatarData,
  hojeISO,
  paletesEquivalentes,
  parqueDeLinhas,
  totaisPorFormato,
  totalEmCaixas,
  type Contagem,
} from "@/lib/ativo-giro";
import {
  salvarFator,
  salvarParque,
  excluirContagemAdmin,
  concederAcessoAtivoGiro,
  revogarAcessoAtivoGiro,
} from "./actions";
import { ExportarContagens } from "./ExportarContagens";
import { ImportarHistorico } from "./ImportarHistorico";

export const dynamic = "force-dynamic";

type Aba = "conciliacao" | "painel" | "historico" | "config" | "acessos";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function AdminAtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    data?: string;
    de?: string;
    ate?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await requireModulo("ativo-giro", "ver");
  const souOwner = ehOwner(perfil.role);

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: "conciliacao", rotulo: "Conciliação" },
    { id: "painel", rotulo: "Painel" },
    { id: "historico", rotulo: "Histórico" },
    { id: "config", rotulo: "Configuração" },
    ...(souOwner ? [{ id: "acessos" as Aba, rotulo: "Acessos" }] : []),
  ];

  const sp = await searchParams;
  const aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "conciliacao") as Aba;
  const dia = sp.data ?? hojeISO();
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();

  const supabase = await createClient();
  const colunas =
    "id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa";

  const [
    { data: fatoresBanco },
    { data: parqueBanco },
    { data: doDia },
    { data: doPeriodo },
  ] = await Promise.all([
    supabase.from("ag_fatores").select("formato, palete, lastro"),
    supabase.from("ag_parque").select("tipo, formato, quantidade"),
    supabase.from("ag_contagens").select(colunas).eq("data", dia).order("id"),
    supabase
      .from("ag_contagens")
      .select(colunas)
      .gte("data", de)
      .lte("data", ate)
      .order("data", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const fatores = fatoresDeLinhas(fatoresBanco);
  const parque = parqueDeLinhas(parqueBanco);
  const contagensDia = (doDia ?? []) as Contagem[];
  const contagensPeriodo = (doPeriodo ?? []) as Contagem[];

  const linhas = conciliar(contagensDia, parque, fatores);
  const totais = totaisPorFormato(contagensDia, fatores);
  const maiorTotal = Math.max(1, ...totais.map((t) => t.total));

  const garrafeira = FORMATOS.map((formato) => {
    const total = contagensDia
      .filter((c) => c.tipo === "GFE sem Garrafa" && c.formato === formato)
      .reduce((s, c) => s + totalEmCaixas(c, fatores[formato]), 0);
    return {
      formato,
      total,
      paletes: paletesEquivalentes(total, fatores[formato]),
    };
  }).filter((g) => g.total > 0);

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
        title="Ativo de Giro"
        subtitle="Conciliação diária, painel e configuração do parque."
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

      <nav className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={`/admin/ativo-de-giro?aba=${a.id}&data=${dia}&de=${de}&ate=${ate}`}
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

      {(aba === "conciliacao" || aba === "painel") && (
        <form method="get" className="mb-4 flex items-end gap-2">
          <input type="hidden" name="aba" value={aba} />
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase text-slate-500"
              htmlFor="data"
            >
              Dia
            </label>
            <input
              id="data"
              type="date"
              name="data"
              defaultValue={dia}
              className={campo}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Ver
          </button>
        </form>
      )}

      {aba === "conciliacao" && (
        <section>
          {linhas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma contagem em {formatarData(dia)}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Formato</th>
                    <th className="p-2 text-right">Contado</th>
                    <th className="p-2 text-right">Parque</th>
                    <th className="p-2 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr
                      key={`${l.tipo}-${l.formato}`}
                      className="border-t border-slate-100"
                    >
                      <td className="p-2">{l.tipo}</td>
                      <td className="p-2">{l.formato}</td>
                      <td className="p-2 text-right">{l.contado}</td>
                      <td className="p-2 text-right">{l.parque}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          l.diferenca === 0
                            ? "text-slate-500"
                            : l.diferenca > 0
                              ? "text-green-600"
                              : "text-red-600"
                        }`}
                      >
                        {l.diferenca > 0 ? "+" : ""}
                        {l.diferenca}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ExportarContagens
            contagens={contagensDia}
            fatores={fatores}
            data={dia}
          />
        </section>
      )}

      {aba === "painel" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Total contado por embalagem (caixas)
            </h2>
            <ul className="space-y-2">
              {totais.map((t) => (
                <li key={t.formato}>
                  <div className="flex justify-between text-sm text-slate-700">
                    <span>{t.formato}</span>
                    <span className="font-bold">{t.total}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(t.total / maiorTotal) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Paletes de garrafeira sem garrafa
            </h2>
            {garrafeira.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma contagem de GFE sem Garrafa neste dia.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700">
                {garrafeira.map((g) => (
                  <li key={g.formato} className="flex justify-between">
                    <span>
                      {g.formato} — {g.total} cx
                    </span>
                    <span className="font-bold">
                      {g.paletes.toFixed(1)} paletes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {aba === "historico" && (
        <section>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="aba" value="historico" />
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="de">
                De
              </label>
              <input id="de" type="date" name="de" defaultValue={de} className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="ate">
                Até
              </label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
              Filtrar
            </button>
          </form>

          {contagensPeriodo.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma contagem no período.
            </p>
          ) : (
            <ul className="space-y-2">
              {contagensPeriodo.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {c.tipo} · {c.formato} · {c.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatarData(c.data)} — {c.colaborador_nome} — Pal{" "}
                      {c.palete} / Las {c.lastro} / Cx {c.caixa}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {totalEmCaixas(c, fatores[c.formato])} cx
                    </span>
                    <form action={excluirContagemAdmin}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <ExportarContagens
            contagens={contagensPeriodo}
            fatores={fatores}
            data={ate}
          />
        </section>
      )}

      {aba === "config" && (
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
                  <span className="flex-1 text-sm text-slate-700">{formato}</span>
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
            Por padrão, nenhum colaborador vê o Ativo de Giro no menu. Libere
            abaixo quem pode lançar contagem.
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
                        liberado ? revogarAcessoAtivoGiro : concederAcessoAtivoGiro
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
    </div>
  );
}
