import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { AREAS, ehPdf } from "@/lib/areas";
import { exigirRevenda } from "@/lib/revendas";
import { salvarEscala, removerEscala } from "./actions";

export default async function AdminEscalaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("escala", "ver");
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");
  const { data: escalas } = await admin
    .from("escala_trabalho")
    .select("area, rotulo, arquivo_url, observacao, atualizado_em")
    .eq("revenda_id", revendaId)
    .order("area", { ascending: true });

  const porArea = new Map((escalas ?? []).map((e) => [e.area, e]));

  return (
    <div>
      <PageHeader
        title="Escala de Trabalho"
        subtitle="Atualize sempre que a escala mudar"
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

      <p className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Envie a escala em <strong>PDF</strong> ou <strong>imagem</strong>. O
        colaborador vê direto na tela, sem precisar baixar. Trocar o arquivo
        substitui o anterior automaticamente.
      </p>

      <div className="space-y-4">
        {AREAS.map((area) => {
          const atual = porArea.get(area.id);
          return (
            <div
              key={area.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-800">{area.rotulo}</h2>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    atual?.arquivo_url
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {atual?.arquivo_url ? "publicada" : "sem escala"}
                </span>
              </div>

              {atual?.arquivo_url && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <a
                    href={atual.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary underline"
                  >
                    Ver escala atual {ehPdf(atual.arquivo_url) ? "(PDF)" : "(imagem)"}
                  </a>
                  <span className="text-xs text-slate-400">
                    atualizada em{" "}
                    {new Date(atual.atualizado_em).toLocaleDateString("pt-BR")}
                  </span>
                  <div className="ml-auto">
                    <BotaoExcluir
                      action={removerEscala}
                      campos={{ area: area.id }}
                      confirmacao={`Remover a escala de ${area.rotulo}?`}
                    >
                      Remover
                    </BotaoExcluir>
                  </div>
                </div>
              )}

              <form action={salvarEscala} className="space-y-3">
                <input type="hidden" name="area" value={area.id} />

                <div>
                  <label
                    htmlFor={`arquivo-${area.id}`}
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Arquivo da escala (PDF ou imagem)
                    {atual?.arquivo_url && " — em branco mantém a atual"}
                  </label>
                  <input
                    id={`arquivo-${area.id}`}
                    name="arquivo"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="w-full rounded-xl border border-slate-200 p-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`obs-${area.id}`}
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Aviso para o time (opcional)
                  </label>
                  <input
                    id={`obs-${area.id}`}
                    name="observacao"
                    defaultValue={atual?.observacao ?? ""}
                    placeholder="Ex: Vigora a partir de 01/08"
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
                >
                  Salvar escala de {area.curto}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
