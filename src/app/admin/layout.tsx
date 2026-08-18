import { requireGestor } from "@/lib/require-admin";
import { VoltarAoPainel } from "@/components/VoltarAoPainel";
import { ehOwner } from "@/lib/acessos";

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

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-gold bg-gold-soft p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
          {dono ? "⚙️ Modo administrador" : "⚙️ Modo liderança"}
        </span>
        <VoltarAoPainel dono={dono} />
      </div>

      {children}
    </div>
  );
}
