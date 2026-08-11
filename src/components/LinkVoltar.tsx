"use client";

import Link from "next/link";
import { DicaLink } from "@/components/DicaLink";

/**
 * Link de "voltar" — o mais tocado do app, e o que estava mais mudo.
 *
 * A regra global de toque mira a[class*="rounded"], porque é assim que os
 * links-botão deste app se parecem. Os "← Voltar" são links de TEXTO, sem
 * canto arredondado: passavam pela regra sem ser pegos, e não afundavam
 * nem piscavam ao toque.
 *
 * Concentrar num componente resolve os três de uma vez e garante que o
 * próximo "voltar" já nasça com toque, espera e área de clique decente.
 */
export function LinkVoltar({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // -ml-1 px-1 py-1.5: aumenta a área tocável sem deslocar o texto da
      // margem. Link de 14px é alvo pequeno para polegar em movimento.
      className={`toque-texto -ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1.5 text-sm font-medium ${className}`}
    >
      {children}
      <DicaLink />
    </Link>
  );
}
