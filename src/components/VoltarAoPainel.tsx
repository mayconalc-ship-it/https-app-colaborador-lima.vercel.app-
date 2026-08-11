"use client";

import { usePathname } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

/**
 * Atalho de volta ao painel. Só aparece nas telas internas do admin —
 * dentro do próprio painel ele não teria função.
 */
export function VoltarAoPainel() {
  const caminho = usePathname();
  if (caminho === "/admin") return null;

  return (
    <LinkVoltar
      href="/admin"
      className="mt-1 font-semibold text-primary-dark hover:underline"
    >
      ← Voltar ao Painel Admin
    </LinkVoltar>
  );
}
