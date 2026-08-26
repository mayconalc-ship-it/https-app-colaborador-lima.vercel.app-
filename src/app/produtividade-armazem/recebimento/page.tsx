import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  LIMITE_AVARIA_ALERTA,
  diasAtrasISO,
  formatarData,
  hojeISO,
  pctAvariaConsolidado,
  type Fabrica,
  type Transportadora,
} from "@/lib/produtividade-armazem";
import { FormRecebimento } from "./FormRecebimento";

export const dynamic = "force-dynamic";

type Aba = "lancar" | "historico";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type RecebimentoBanco = {
  id: string;
  placa_carreta: string;
  motoristas: string;
  conferente_nome: string;
  ajudante_nome: string | null;
  operador_nome: string | null;
  data_recebimento: string;
  pa_fabricas: { nome: string } | { nome: string }[] | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
  pa_recebimento_itens: {
    id: string;
    quantidade_recebida: number;
    quantidade_avariada: number;
    pct_avaria: number;
    pa_produtos: { codigo: string; descricao: string } | { codigo: string; descricao: string }[] | null;
  }[];
};

function nomeRelacionado(v: { nome: string } | { nome: string }[] | null) {
  if (!v) return "—";
  return Array.isArray(v) ? (v[0]?.nome ?? "—") : v.nome;
}

export default async function RecebimentoPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    de?: string;
    ate?: string;
    transportadora?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  await requireAcessoModulo("pa-recebimento");

  const sp = await searchParams;
  const aba: Aba = sp.aba === "historico" ? "historico" : "lancar";
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const transportadoraFiltro = (sp.transportadora ?? "").trim();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: fabricasBanco }, { data: transportadorasBanco }, { count: totalProdutos }, { data: historicoBanco }] =
    await Promise.all([
      supabase.from("pa_fabricas").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
      supabase
        .from("pa_transportadoras")
        .select("id, nome")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .order("nome"),
      // Só a contagem: a base tem dezenas de milhares de produtos, e o
      // formulário busca sob demanda (ver ComboboxProduto) -- aqui só
      // precisamos saber se existe ALGUM cadastrado.
      supabase.from("pa_produtos").select("id", { count: "exact", head: true }).eq("revenda_id", revendaId).eq("ativo", true),
      aba === "historico"
        ? (() => {
            let q = supabase
              .from("pa_recebimentos")
              .select(
                "id, placa_carreta, motoristas, conferente_nome, ajudante_nome, operador_nome, data_recebimento, transportadora_id, pa_fabricas(nome), pa_transportadoras(nome), pa_recebimento_itens(id, quantidade_recebida, quantidade_avariada, pct_avaria, pa_produtos(codigo, descricao))",
              )
              .eq("revenda_id", revendaId)
              .gte("data_recebimento", de)
              .lte("data_recebimento", ate);
            if (transportadoraFiltro) q = q.eq("transportadora_id", transportadoraFiltro);
            return q.order("data_recebimento", { ascending: false }).limit(100);
          })()
        : Promise.resolve({ data: null }),
    ]);

  const fabricas: Fabrica[] = fabricasBanco ?? [];
  const transportadoras: Transportadora[] = transportadorasBanco ?? [];
  const historico = (historicoBanco ?? []) as unknown as RecebimentoBanco[];

  return (
    <div>
      <PageHeader
        title="Recebimento de Paletes"
        subtitle="Registre o recebido e o avariado por produto."
      />

      <a href="/produtividade-armazem" className="mb-4 inline-flex text-sm font-medium text-primary hover:underline">
        ← Produtividade do Armazém
      </a>

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
        (fabricas.length === 0 || transportadoras.length === 0 || !totalProdutos ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Cadastre fábricas, transportadoras e produtos em Configuração antes de
            lançar um recebimento.
          </p>
        ) : (
          <FormRecebimento fabricas={fabricas} transportadoras={transportadoras} />
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
              <label className={rotulo} htmlFor="transportadora">Transportadora</label>
              <select id="transportadora" name="transportadora" defaultValue={transportadoraFiltro} className={campo}>
                <option value="">Todas</option>
                {transportadoras.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
              Filtrar
            </button>
          </form>

          {historico.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum recebimento no período.
            </p>
          ) : (
            <ul className="space-y-3">
              {historico.map((r) => {
                const pctConsolidado = pctAvariaConsolidado(
                  r.pa_recebimento_itens.map((i) => ({
                    id: i.id,
                    produtoId: "",
                    produtoCodigo: "",
                    produtoDescricao: "",
                    quantidadeRecebida: i.quantidade_recebida,
                    quantidadeAvariada: i.quantidade_avariada,
                    pctAvaria: i.pct_avaria,
                  })),
                );
                const alerta = pctConsolidado > LIMITE_AVARIA_ALERTA;
                return (
                  <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {nomeRelacionado(r.pa_fabricas)} → {nomeRelacionado(r.pa_transportadoras)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarData(r.data_recebimento)} — Carreta {r.placa_carreta} —{" "}
                          {r.motoristas}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Conferente: {r.conferente_nome}
                          {r.ajudante_nome && ` · Ajudante: ${r.ajudante_nome}`}
                          {r.operador_nome && ` · Operador: ${r.operador_nome}`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${
                          alerta ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                        }`}
                      >
                        {pctConsolidado}% avaria
                      </span>
                    </div>

                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left uppercase text-slate-500">
                          <tr>
                            <th className="p-2">Produto</th>
                            <th className="p-2 text-right">Recebido</th>
                            <th className="p-2 text-right">Avariado</th>
                            <th className="p-2 text-right">% avaria</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.pa_recebimento_itens.map((i) => {
                            const produto = Array.isArray(i.pa_produtos) ? i.pa_produtos[0] : i.pa_produtos;
                            return (
                              <tr key={i.id} className="border-t border-slate-100">
                                <td className="p-2">
                                  {produto ? `${produto.codigo} — ${produto.descricao}` : "—"}
                                </td>
                                <td className="p-2 text-right">{i.quantidade_recebida}</td>
                                <td className="p-2 text-right">{i.quantidade_avariada}</td>
                                <td className="p-2 text-right font-semibold">{i.pct_avaria}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
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
