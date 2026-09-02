"use client";

import { usePathname } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

/**
 * O caminho de volta ao painel da área, e o único "voltar" das telas
 * internas. Dentro do próprio painel ele não teria função.
 *
 * O nome do destino acompanha o modo: quem é liderança nunca viu um
 * "Painel Admin" para onde voltar, e o rótulo antigo prometia uma tela que
 * não era a dela.
 */
export function VoltarAoPainel({
  dono,
  painel = "/admin",
  rotulo,
}: {
  dono: boolean;
  /** O painel desta área. A Gestão tem o dela. */
  painel?: string;
  rotulo?: string;
}) {
  const caminho = usePathname();
  if (caminho === painel) return null;

  const destino = rotulo ?? (dono ? "Painel Admin" : "Painel da Liderança");

  return (
    <div>
      <LinkVoltar
        href={painel}
        className="mt-1 font-semibold text-primary-dark hover:underline"
      >
        ← Voltar ao {destino}
      </LinkVoltar>
    </div>
  );
}
