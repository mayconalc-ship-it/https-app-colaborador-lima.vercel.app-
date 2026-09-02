import { redirect } from "next/navigation";
import { requireGestor } from "@/lib/require-admin";
import { AdminSidebar, type GrupoNav } from "@/components/admin/AdminSidebar";
import { VoltarAoPainel } from "@/components/VoltarAoPainel";
import { ehOwner } from "@/lib/acessos";
import { BLOCOS_DA_GESTAO } from "@/lib/gestao";
import { paineisVisiveis } from "@/lib/gestao-server";

/**
 * A área de Gestão -- o lugar de LER.
 *
 * Mesma casca do Modo Liderança de propósito: a mesma barra, o mesmo
 * comportamento de gaveta, o mesmo botão ☰ no celular. São duas áreas,
 * não dois aplicativos, e quem aprendeu a andar numa não precisa
 * reaprender na outra. O que muda é a faixa do topo e o que a barra
 * contém.
 */
export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requireGestor();
  const dono = ehOwner(perfil.role);
  const paineis = await paineisVisiveis();

  // Quem não pode abrir nenhum painel não fica numa área vazia olhando
  // para uma barra sem itens: volta para o painel de onde veio.
  if (paineis.length === 0) redirect("/admin");

  const grupos: GrupoNav[] = BLOCOS_DA_GESTAO.map((bloco) => ({
    titulo: bloco,
    itens: paineis
      .filter((p) => p.bloco === bloco)
      .map((p) => ({ id: p.id, href: p.href, rotulo: p.rotulo, emoji: p.emoji })),
  })).filter((g) => g.itens.length > 0);

  return (
    <div>
      <AdminSidebar
        grupos={grupos}
        grupoDono={null}
        home={{ href: "/gestao", rotulo: "Painel de Gestão", emoji: "📊" }}
        atalho={{
          id: "admin",
          href: "/admin",
          rotulo: dono ? "Modo administrador" : "Modo liderança",
          emoji: "⚙️",
        }}
      />

      <div className="md:pl-20">
        <div className="mb-4 rounded-2xl border border-primary bg-primary-soft p-3 pl-14 md:pl-3">
          <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
            📊 Modo gestão — acompanhar
          </span>
          <VoltarAoPainel dono={dono} painel="/gestao" rotulo="Painel de Gestão" />
        </div>

        {children}
      </div>
    </div>
  );
}
