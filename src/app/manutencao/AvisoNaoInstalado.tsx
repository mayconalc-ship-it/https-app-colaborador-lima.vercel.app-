import { PageHeader } from "@/components/PageHeader";

/** As tabelas da migration (156 ou 157) ainda não existem neste banco. */
export function AvisoNaoInstalado({
  titulo = "☑️ Check de Manutenção",
  migration = "156 (Check de Manutenção)",
}: {
  titulo?: string;
  migration?: string;
}) {
  return (
    <div>
      <PageHeader title={titulo} fecharHref="/" />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🧰
        </p>
        <p className="mt-2 font-semibold text-amber-900">O módulo ainda não foi instalado no banco</p>
        <p className="mt-1 text-sm text-amber-800">
          Falta rodar a migration {migration} no Supabase. Peça ao Admin do app.
        </p>
      </div>
    </div>
  );
}
