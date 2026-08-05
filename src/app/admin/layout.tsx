import Link from "next/link";
import { requireGestor } from "@/lib/require-admin";
import { VoltarAoPainel } from "@/components/VoltarAoPainel";
import { ehOwner } from "@/lib/acessos";

/**
 * Faixa presente em todo o Modo Liderança.
 *
 * Serve para a pessoa saber em qual modo está -- é fácil esquecer que
 * trocou -- e ter uma saída clara de volta para o app, sem precisar sair
 * da conta. A sessão é a mesma; o que muda é só o contexto.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await requireGestor();
  const dono = ehOwner(perfil.role);

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-gold bg-gold-soft p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
            {dono ? "⚙️ Modo administrador" : "⚙️ Modo liderança"}
          </span>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            ← Voltar para o app
          </Link>
        </div>
        <VoltarAoPainel />
      </div>

      {children}
    </div>
  );
}
