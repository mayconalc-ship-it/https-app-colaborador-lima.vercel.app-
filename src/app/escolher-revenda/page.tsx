import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getRevendas, getRevendaAtiva } from "@/lib/revendas";
import { trocarRevenda } from "./actions";

export default async function EscolherRevendaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const [revendas, atual, params] = await Promise.all([
    getRevendas(),
    getRevendaAtiva(),
    searchParams,
  ]);

  // Quem tem uma revenda só não tem o que escolher -- o app já deduziu.
  if (revendas.length <= 1) redirect("/");

  return (
    <div>
      <PageHeader
        title="Escolher revenda"
        subtitle="Você responde por mais de uma revenda. Tudo o que o app mostrar a seguir é da revenda escolhida aqui."
      />

      {params.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {params.erro}
        </p>
      )}

      <div className="space-y-3">
        {revendas.map((revenda) => {
          const ativa = revenda.id === atual?.id;
          return (
            <form key={revenda.id} action={trocarRevenda}>
              <input type="hidden" name="revenda_id" value={revenda.id} />
              <button
                type="submit"
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left shadow-sm transition ${
                  ativa
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 bg-white hover:border-primary/40"
                }`}
              >
                <span>
                  <span className="block font-semibold text-slate-900">
                    {revenda.nome}
                  </span>
                  {revenda.principal && (
                    <span className="text-xs text-slate-500">
                      Sua revenda padrão
                    </span>
                  )}
                </span>
                {ativa && (
                  <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white">
                    Em uso
                  </span>
                )}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
