import Link from "next/link";
import { guiaPorSlug } from "@/lib/guia";

/**
 * "❓ Passo a passo: ..." -- o guia certo, na tela em que a dúvida
 * aparece. O título vem do próprio guia, para o link nunca prometer um
 * passo a passo com outro nome.
 */
export function LinkDoGuia({ slug, className = "" }: { slug: string; className?: string }) {
  const guia = guiaPorSlug(slug);
  if (!guia) return null;

  return (
    <Link
      href={`/guia/${guia.slug}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary-soft px-2.5 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/10 ${className}`}
    >
      ❓ Passo a passo: {guia.titulo.toLowerCase()}
    </Link>
  );
}
