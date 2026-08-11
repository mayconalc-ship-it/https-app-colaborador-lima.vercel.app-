import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import {
  FORMATOS,
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
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { getUltimaCombinacao } from "./ultima-combinacao";
import { FormContagem } from "./FormContagem";
import { ContagemItem } from "./ContagemItem";
import { excluirContagem } from "./actions";
import { ExportarContagens } from "./ExportarContagens";

export const dynamic = "force-dynamic";

type Aba = "contagem" | "painel" | "conciliacao" | "historico";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "contagem", rotulo: "Contagem" },
  { id: "painel", rotulo: "Painel" },
  { id: "conciliacao", rotulo: "Concil." },
  { id: "historico", rotulo: "Histórico" },
];

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function AtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    data?: string;
    de?: string;
    ate?: string;
    quem?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  // Módulo opcional: só quem o Admin liberou (ou gestor/dono) entra aqui.
  if (!(await temAcessoModulo("ativo-giro"))) {
    redirect(
      `/?erro=${encodeURIComponent(
        "Você não tem acesso ao Ativo de Giro. Fale com o Admin.",
      )}`,
    );
  }

  const sp = await searchParams;
  const aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "contagem") as Aba;
  const dia = sp.data ?? hojeISO();
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const quem = (sp.quem ?? "").trim();

  // Conciliação, painel e histórico enxergam o trabalho do time inteiro --
  // a RLS de ag_contagens já libera leitura para qualquer autenticado, então
  // isso não precisa do service role, só de estar logado.
  const supabase = await createClient();
  const colunas =
    "id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa";

  const [
    { data: fatoresBanco },
    { data: parqueBanco },
    { data: minhas },
    { data: doDia },
    { data: doPeriodo },
    podeConfigurar,
    podeExcluirQualquer,
    ultimaCombinacao,
  ] = await Promise.all([
    supabase.from("ag_fatores").select("formato, palete, lastro"),
    supabase.from("ag_parque").select("tipo, formato, quantidade"),
    supabase
      .from("ag_contagens")
      .select(colunas)
      .eq("colaborador_id", perfil.id)
      .order("data", { ascending: false })
      .order("id", { ascending: false })
      .limit(60),
    aba === "painel" || aba === "conciliacao"
      ? supabase.from("ag_contagens").select(colunas).eq("data", dia).order("id")
      : Promise.resolve({ data: null }),
    aba === "historico"
      ? (() => {
          let consulta = supabase
            .from("ag_contagens")
            .select(colunas)
            .gte("data", de)
            .lte("data", ate);
          if (quem) consulta = consulta.ilike("colaborador_nome", `%${quem}%`);
          return consulta
            .order("data", { ascending: false })
            .order("id", { ascending: false });
        })()
      : Promise.resolve({ data: null }),
    podeNoModulo("ativo-giro", "editar"),
    podeNoModulo("ativo-giro", "excluir"),
    getUltimaCombinacao(),
  ]);

  const fatores = fatoresDeLinhas(fatoresBanco);
  const parque = parqueDeLinhas(parqueBanco);
  const contagens = (minhas ?? []) as Contagem[];
  const minhasDeHoje = contagens.filter((c) => c.data === hojeISO());
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

  return (
    <div>
      <PageHeader
        title="Ativo de Giro"
        subtitle="Lance a contagem do dia, acompanhe o painel e a conciliação do time."
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
            href={`/ativo-de-giro?aba=${a.id}&data=${dia}&de=${de}&ate=${ate}&quem=${encodeURIComponent(quem)}`}
            // aria-current é o que faz o leitor de tela anunciar "página
            // atual". Sem ele a aba ativa só se distinguia pela cor -- e
            // cor sozinha não serve para quem não enxerga a diferença.
            aria-current={a.id === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a.id === aba
                ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a.rotulo}
          </a>
        ))}
      </nav>

      {aba === "contagem" && (
        <section>
          <FormContagem fatores={fatores} ultima={ultimaCombinacao} />

          <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">
            Minhas contagens
          </h2>

          {contagens.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Você ainda não registrou nenhuma contagem.
            </p>
          ) : (
            <ul className="space-y-2">
              {contagens.map((c) => (
                <ContagemItem key={c.id} contagem={c} fatores={fatores} />
              ))}
            </ul>
          )}

          {minhasDeHoje.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">
                Compartilhar contagem de hoje
              </h2>
              <ExportarContagens
                contagens={minhasDeHoje}
                fatores={fatores}
                data={hojeISO()}
              />
            </>
          )}
        </section>
      )}

      {(aba === "painel" || aba === "conciliacao") && (
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
              <label
                className="mb-1 block text-xs font-semibold uppercase text-slate-500"
                htmlFor="de"
              >
                De
              </label>
              <input id="de" type="date" name="de" defaultValue={de} className={campo} />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase text-slate-500"
                htmlFor="ate"
              >
                Até
              </label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label
                className="mb-1 block text-xs font-semibold uppercase text-slate-500"
                htmlFor="quem"
              >
                Colaborador
              </label>
              <input
                id="quem"
                type="text"
                name="quem"
                placeholder="Nome do colaborador"
                defaultValue={quem}
                className={campo}
              />
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
              {contagensPeriodo.map((c) => {
                const podeExcluirEsta =
                  c.colaborador_id === perfil.id || podeExcluirQualquer;
                return (
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
                      {podeExcluirEsta && (
                        <BotaoExcluir
                          action={excluirContagem}
                          campos={{ id: c.id }}
                          confirmacao={`Excluir a contagem de ${c.colaborador_nome} em ${formatarData(c.data)}?`}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Excluir
                        </BotaoExcluir>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <ExportarContagens
            contagens={contagensPeriodo}
            fatores={fatores}
            data={ate}
          />
        </section>
      )}

      {podeConfigurar && (
        <a
          href="/admin/ativo-de-giro"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ⚙️ Abrir configuração (parque, fatores e acessos) →
        </a>
      )}
    </div>
  );
}
