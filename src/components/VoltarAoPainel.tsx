"use client";

import { usePathname } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

/**
 * O caminho de volta ao painel do modo, e o único "voltar" das telas
 * internas de gestão. Dentro do próprio painel ele não teria função.
 *
 * O nome do destino acompanha o modo: quem é liderança nunca viu um
 * "Painel Admin" para onde voltar, e o rótulo antigo prometia uma tela que
 * não era a dela.
 */
export function VoltarAoPainel({ dono }: { dono: boolean }) {
  const caminho = usePathname();
  if (caminho === "/admin") return null;

  return (
    <div>
      <LinkVoltar
        href="/admin"
        className="mt-1 font-semibold text-primary-dark hover:underline"
      >
        ← Voltar ao {dono ? "Painel Admin" : "Painel da Liderança"}
      </LinkVoltar>
    </div>
  );
}
