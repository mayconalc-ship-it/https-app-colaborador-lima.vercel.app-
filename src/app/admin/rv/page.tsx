import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { testarConexaoRV } from "./actions";

export default async function AdminRVPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; teste?: string }>;
}) {
  await requireModulo("rv", "ver");
  const { erro, sucesso, teste } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");
  const { data: configs } = await admin
    .from("rv_config")
    .select("area, rotulo, csv_url, coluna_cpf, coluna_valor, atualizado_em")
    .eq("revenda_id", revendaId)
    .order("area", { ascending: true });

  const conectadas = (configs ?? []).filter((c) => c.csv_url).length;

  return (
    <div>
      <PageHeader
        title="Remuneração Variável"
        subtitle="Conferir a planilha e avisar quem tem RV no fechamento da competência"
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
      {teste && (
        <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          {decodificar(teste)}
        </p>
      )}

      {/*
        OS LINKS SAÍRAM DAQUI (08/09/2026, pedido do dono: "consegue mover a
        remuneração também?").

        Eles moram em 🔌 Fontes de Dados, junto com as outras seis fontes --
        é lá que se responde "de onde vem cada número do app?", e apontar a
        planilha da RV é exatamente isso. A action é a mesma; só a tela
        mudou.

        O que ficou: conferir um CPF e avisar quem tem RV. Nenhum dos dois é
        fonte de dado -- são a operação do fechamento da competência, e é
        por ela que se vem a esta tela.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {conectadas} de {(configs ?? []).length} planilha(s) conectada(s)
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Apontar as planilhas e avisar o time que a RV foi atualizada ficam em Fontes de Dados.
          </p>
        </div>
        <Link
          href="/admin/fontes-de-dados?aberta=rv#fonte-rv"
          className="shrink-0 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-dark hover:bg-primary/10"
        >
          🔌 Apontar as planilhas e avisar →
        </Link>
      </div>

      <div className="space-y-4">
        {(configs ?? []).map((config) => (
          <div
            key={config.area}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{config.rotulo}</h2>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  config.csv_url
                    ? "bg-green-100 text-green-800"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {config.csv_url ? "conectada" : "sem link"}
              </span>
            </div>

            {!config.csv_url && (
              <p className="mb-3 rounded-xl bg-amber-50 p-2.5 text-xs leading-snug text-amber-900">
                Sem link, não há o que conferir. Aponte a planilha em{" "}
                <Link href="/admin/fontes-de-dados" className="font-semibold underline">
                  Fontes de Dados
                </Link>
                .
              </p>
            )}

            <form action={testarConexaoRV} className="flex items-end gap-2">
              <input type="hidden" name="area" value={config.area} />
              <div className="flex-1">
                <label
                  htmlFor={`cpf-teste-${config.area}`}
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Conferir um CPF (opcional)
                </label>
                <input
                  id={`cpf-teste-${config.area}`}
                  name="cpf_teste"
                  inputMode="numeric"
                  placeholder="Ex: 08455629592"
                  className="w-full rounded-xl border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              {/* Baixa a planilha inteira do Drive na hora: é a espera mais
                  longa do Modo Liderança, medida em segundos. */}
              <BotaoEnviar
                compacto
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Testar
              </BotaoEnviar>
            </form>
          </div>
        ))}

        {/* O "avisar que a RV foi atualizada" saiu daqui (08/09/2026): ele
            É a atualização desta fonte -- a RV é lida ao vivo da planilha,
            então não existe importação e o aviso faz o papel dela. Mora na
            gaveta da RV em Fontes de Dados, com o link. Ficou nos dois
            lugares por engano meu na primeira passada. */}
      </div>
    </div>
  );
}
