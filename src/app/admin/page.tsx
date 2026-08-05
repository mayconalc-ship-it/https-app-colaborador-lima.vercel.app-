import { decodificar } from "@/lib/texto-url";
import Link from "next/link";
import { requireGestor } from "@/lib/require-admin";
import { getConcessoes } from "@/lib/sessao";
import { MenuCard } from "@/components/MenuCard";
import { PageHeader } from "@/components/PageHeader";
import {
  MODULOS,
  MODULOS_DO_DONO,
  ehOwner,
  podeFazer,
} from "@/lib/acessos";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const perfil = await requireGestor();
  const { erro } = await searchParams;
  const concessoes = await getConcessoes();
  const dono = ehOwner(perfil.role);

  // A pessoa nem vê o cartão do que não pode abrir. Mostrar e barrar depois
  // só geraria a dúvida de "por que não posso?".
  const liberados = MODULOS.filter((m) =>
    podeFazer(perfil.role, concessoes, m.id, "ver"),
  );

  const grupos = ["Conteúdo do app", "Pessoas e configuração"] as const;

  return (
    <div>
      <PageHeader
        title={dono ? "Painel Admin" : "Painel da Liderança"}
        subtitle={
          dono
            ? "Controle total do app"
            : "Você administra os módulos liberados para você"
        }
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}

      {liberados.length === 0 && !dono && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Você ainda não tem nenhum módulo liberado. Fale com o Admin do app.
        </div>
      )}

      <div className="space-y-6">
        {grupos.map((grupo) => {
          const itens = liberados.filter((m) => m.grupo === grupo);
          if (itens.length === 0) return null;
          return (
            <section key={grupo}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {grupo}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {itens.map((m) => (
                  <MenuCard
                    key={m.id}
                    href={m.href}
                    title={m.rotulo}
                    emoji={m.emoji}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Área do dono. Nunca delegável: é aqui que se decide quem pode o quê. */}
        {dono && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Só do Admin
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {MODULOS_DO_DONO.map((m) => (
                <MenuCard
                  key={m.href}
                  href={m.href}
                  title={m.rotulo}
                  emoji={m.emoji}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {!dono && (
        <p className="mt-6 text-xs text-slate-400">
          Precisa de acesso a mais alguma coisa?{" "}
          <Link href="/" className="text-primary hover:underline">
            Fale com o Admin do app.
          </Link>
        </p>
      )}
    </div>
  );
}
