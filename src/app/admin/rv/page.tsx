import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import {
  avisarRVAtualizada,
  salvarConfigRV,
  testarConexaoRV,
} from "./actions";

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

  return (
    <div>
      <PageHeader
        title="Remuneração Variável"
        subtitle="Conectar as planilhas publicadas no Google Drive"
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

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p className="mb-2 font-semibold text-slate-800">
          Como pegar o link certo
        </p>
        <p className="mb-2">
          <strong>Se o arquivo for Excel (.xlsx) no Drive:</strong> clique com o
          botão direito no arquivo → <strong>Compartilhar</strong> → em
          &ldquo;Acesso geral&rdquo; escolha{" "}
          <strong>Qualquer pessoa com o link</strong> →{" "}
          <strong>Copiar link</strong> e cole aqui.
        </p>
        <p className="mb-2">
          <strong>Se for uma planilha do Google Sheets:</strong> menu{" "}
          <strong>Arquivo → Compartilhar → Publicar na web</strong>, formato{" "}
          <strong>CSV</strong>, e cole o link gerado.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Deixe uma coluna de <strong>CPF</strong> e, se quiser histórico, uma
          coluna de <strong>competência/mês</strong> (ex: 2026-07). O app
          identifica as colunas sozinho pelo cabeçalho.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          O link fica guardado só no servidor — nunca é enviado ao celular do
          colaborador. Cada pessoa recebe apenas a própria linha.
        </p>
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

            <form action={salvarConfigRV} className="space-y-3">
              <input type="hidden" name="area" value={config.area} />

              <div>
                <label
                  htmlFor={`url-${config.area}`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Link da planilha (Excel do Drive ou Google Sheets)
                </label>
                <input
                  id={`url-${config.area}`}
                  name="csv_url"
                  defaultValue={config.csv_url ?? ""}
                  placeholder="Cole aqui o link do arquivo no Drive"
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label
                    htmlFor={`cpf-${config.area}`}
                    className="mb-1 block text-xs font-medium text-slate-600"
                  >
                    Coluna do CPF (opcional)
                  </label>
                  <input
                    id={`cpf-${config.area}`}
                    name="coluna_cpf"
                    defaultValue={config.coluna_cpf ?? ""}
                    placeholder="detecta sozinho"
                    className="w-full rounded-xl border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor={`valor-${config.area}`}
                    className="mb-1 block text-xs font-medium text-slate-600"
                  >
                    Coluna do valor (opcional)
                  </label>
                  <input
                    id={`valor-${config.area}`}
                    name="coluna_valor"
                    defaultValue={config.coluna_valor ?? ""}
                    placeholder="detecta sozinho"
                    className="w-full rounded-xl border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
              >
                Salvar
              </button>
            </form>

            <form action={testarConexaoRV} className="mt-3 flex items-end gap-2">
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
              <button
                type="submit"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Testar
              </button>
            </form>
          </div>
        ))}

        {/* A RV é lida ao vivo da planilha, então o app não tem como saber
            sozinho que você a atualizou. Quem sabe a hora certa é você. */}
        <form
          action={avisarRVAtualizada}
          className="rounded-2xl border border-gold bg-gold-soft p-4"
        >
          <p className="text-sm font-semibold text-primary-dark">
            🔔 Avisar o time que a RV foi atualizada
          </p>
          <p className="mt-1 text-xs text-primary-dark">
            Manda um aviso para todos conferirem a própria RV. Use depois de
            fechar a competência na planilha.
          </p>
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Avisar todo mundo
          </button>
        </form>
      </div>
    </div>
  );
}
