"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Atalho de volta ao painel. Só aparece nas telas internas do admin —
 * dentro do próprio painel ele não teria função.
 */
export function VoltarAoPainel() {
  const caminho = usePathname();
  if (caminho === "/admin") return null;

  return (
    <Link
      href="/admin"
      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline"
    >
      ← Voltar ao Painel Admin
    </Link>
  );
}
