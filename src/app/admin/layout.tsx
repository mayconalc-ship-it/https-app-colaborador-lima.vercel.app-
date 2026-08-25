import { requireGestor } from "@/lib/require-admin";
import { VoltarAoPainel } from "@/components/VoltarAoPainel";
import { AdminSidebar, type GrupoNav } from "@/components/admin/AdminSidebar";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaAtiva, getModulosDaRevenda } from "@/lib/revendas";
import { MODULOS, MODULOS_DO_DONO, ehOwner, podeFazer } from "@/lib/acessos";

/**
 * Faixa presente em todo o Modo Liderança.
 *
 * Serve para a pessoa saber em qual modo está -- é fácil esquecer que
 * trocou. A saída para o app NÃO fica aqui: ela é o botão do topo, que
 * troca de modo. Ter as duas saídas obrigava a escolher entre dois botões
 * de destino parecido, e era daí que vinha a confusão.
 *
 * Sobra para esta faixa um caminho só: subir das telas internas de volta
 * ao painel do modo.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await requireGestor();
  const dono = ehOwner(perfil.role);

  // Mesmo filtro de admin/page.tsx: a revenda usa o módulo? e esta pessoa
  // pode abri-lo? A barra lateral só é a apresentação nova -- quem decide
  // o que aparece continua sendo exatamente essa dupla checagem.
  const [concessoes, revenda] = await Promise.all([
    getConcessoes(),
    getRevendaAtiva(),
  ]);
  const modulosDaRevenda = revenda
    ? await getModulosDaRevenda(revenda.id)
    : new Set<string>();

  const liberados = MODULOS.filter(
    (m) =>
      modulosDaRevenda.has(m.id) &&
      podeFazer(perfil.role, concessoes, m.id, "ver"),
  );

  const grupos: GrupoNav[] = (
    ["Conteúdo do app", "Pessoas e configuração"] as const
  )
    .map((titulo) => ({
      titulo,
      itens: liberados
        .filter((m) => m.grupo === titulo)
        .map((m) => ({ id: m.id, href: m.href, rotulo: m.rotulo, emoji: m.emoji })),
    }))
    .filter((g) => g.itens.length > 0);

  const grupoDono = dono
    ? MODULOS_DO_DONO.map((m) => ({ id: m.href, href: m.href, rotulo: m.rotulo, emoji: m.emoji }))
    : null;

  return (
    <div>
      <AdminSidebar
        grupos={grupos}
        grupoDono={grupoDono}
        home={{
          href: "/admin",
          rotulo: dono ? "Painel Admin" : "Painel da Liderança",
          emoji: "⚙️",
        }}
      />

      <div className="md:pl-20">
        <div className="mb-4 rounded-2xl border border-gold bg-gold-soft p-3 pl-14 md:pl-3">
          <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
            {dono ? "⚙️ Modo administrador" : "⚙️ Modo liderança"}
          </span>
          <VoltarAoPainel dono={dono} />
        </div>

        {children}
      </div>
    </div>
  );
}
