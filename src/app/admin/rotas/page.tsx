import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { AtalhoParaAFonte } from "@/components/admin/AtalhoParaAFonte";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { formatarDataBr } from "@/lib/rotas";
import {
  apagarRotasDoDia,
  salvarMetasDeRota,
} from "./actions";

export default async function AdminRotasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("rotas", "ver");
  const { erro, sucesso } = await searchParams;

  const podeImportar = await podeNoModulo("rotas", "criar");
  const podeApagar = await podeNoModulo("rotas", "excluir");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");

  const [{ data: config }, { data: rotas }] = await Promise.all([
    admin
      .from("rotas_config")
      .select(
        "pasta_link, ultima_sincronizacao, ultimo_resultado, meta_ocupacao, meta_caixas",
      )
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("rotas")
      .select("data")
      .eq("revenda_id", revendaId)
      .order("data", { ascending: false })
      .limit(3000),
  ]);

  const porDia = new Map<string, number>();
  for (const r of rotas ?? []) {
    porDia.set(r.data, (porDia.get(r.data) ?? 0) + 1);
  }
  const dias = Array.from(porDia.entries()).slice(0, 40);

  return (
    <div>
      <PageHeader
        title="🚚 Minha Rota"
        subtitle="A pasta do Drive alimenta a pré-rota"
      />

      {erro && (
        <p className="mb-3 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 whitespace-pre-line rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      {/* A PASTA E O BOTÃO DE ATUALIZAR SAÍRAM DAQUI, com o "avisar o
          time" junto (08/09/2026). Esta tela fica com as METAS -- que são
          regra do indicador, não fonte -- e com o histórico do que entrou. */}
      {podeImportar && <AtalhoParaAFonte chave="rotas" />}

      {podeImportar && config?.ultima_sincronizacao && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Última atualização</p>
          <p className="text-sm font-semibold text-slate-700">
            {new Date(config.ultima_sincronizacao).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {config.ultimo_resultado && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{config.ultimo_resultado}</p>
          )}
        </div>
      )}

      {/* ---- Metas ---- */}
      {podeImportar && (
        <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer p-4 font-semibold text-primary">
            🎯 Metas da operação
          </summary>
          <form
            action={salvarMetasDeRota}
            className="space-y-3 border-t border-slate-100 p-4"
          >
            <p className="text-xs text-slate-500">
              É daqui que sai a cor das barras na tela do motorista. Mudou a
              meta, muda a leitura do app inteiro.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="meta_ocupacao"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Ocupação (%)
                </label>
                <input
                  id="meta_ocupacao"
                  name="meta_ocupacao"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  defaultValue={config?.meta_ocupacao ?? 70}
                  className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Vale para caixas e peso.
                </p>
              </div>

              <div>
                <label
                  htmlFor="meta_caixas"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Caixas por viagem
                </label>
                <input
                  id="meta_caixas"
                  name="meta_caixas"
                  inputMode="decimal"
                  defaultValue={config?.meta_caixas ?? ""}
                  placeholder="Ex: 200"
                  className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Em branco = não cobra.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold">Como a cor é decidida</p>
              <p className="mt-1">
                🟢 <strong>Na meta</strong> — atingiu ou passou
                <br />
                🟡 <strong>Quase lá</strong> — de 85% da meta para cima
                <br />
                🔴 <strong>Abaixo</strong> — o resto
              </p>
              <p className="mt-1.5 text-slate-500">
                Com meta de {config?.meta_ocupacao ?? 70}%, o amarelo começa
                em{" "}
                {Math.round((config?.meta_ocupacao ?? 70) * 0.85)}%.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
            >
              Salvar metas
            </button>
          </form>
        </details>
      )}

      {/* ---- Dias na base ---- */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Dias na base ({porDia.size})
      </h2>

      {dias.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma rota importada ainda.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {dias.map(([dia, total]) => (
            <li
              key={dia}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {formatarDataBr(dia)}
                </p>
                <p className="text-xs text-slate-400">
                  {total} mapa{total === 1 ? "" : "s"}
                </p>
              </div>
              {podeApagar && (
                <form action={apagarRotasDoDia}>
                  <input type="hidden" name="data" value={dia} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Apagar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-400">
        A planilha no Drive continua sendo a fonte. O app guarda uma cópia
        para a consulta ser instantânea quando todos os motoristas perguntam
        ao mesmo tempo, antes de sair.
      </p>
    </div>
  );
}
