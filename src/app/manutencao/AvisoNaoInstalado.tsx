import { PageHeader } from "@/components/PageHeader";

/** As tabelas da migration 156 ainda não existem neste banco. */
export function AvisoNaoInstalado() {
  return (
    <div>
      <PageHeader title="🛠️ Check de Manutenção" fecharHref="/" />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🧰
        </p>
        <p className="mt-2 font-semibold text-amber-900">O módulo ainda não foi instalado no banco</p>
        <p className="mt-1 text-sm text-amber-800">
          Falta rodar a migration 156 (Check de Manutenção) no Supabase. Peça ao Admin do app.
        </p>
      </div>
    </div>
  );
}
