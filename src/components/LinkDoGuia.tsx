import Link from "next/link";
import { CATEGORIAS_DO_GUIA, guiaPorSlug, type CategoriaDoGuia } from "@/lib/guia";

const classe =
  "inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary-soft px-2.5 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/10";

/**
 * "❓ Passo a passo: ..." -- o guia certo, na tela em que a dúvida
 * aparece. O título vem do próprio guia, para o link nunca prometer um
 * passo a passo com outro nome.
 *
 * Com `categoria` no lugar de `slug`, leva à seção inteira do assunto: é
 * o caso das telas que têm vários guias (Armazém, 5S).
 */
export function LinkDoGuia({
  slug,
  categoria,
  className = "",
}: {
  slug?: string;
  categoria?: CategoriaDoGuia;
  className?: string;
}) {
  if (categoria) {
    const c = CATEGORIAS_DO_GUIA.find((x) => x.id === categoria);
    if (!c) return null;
    return (
      <Link href={`/guia#${c.id}`} className={`${classe} ${className}`}>
        ❓ Passo a passo: {c.titulo}
      </Link>
    );
  }

  const guia = slug ? guiaPorSlug(slug) : undefined;
  if (!guia) return null;

  return (
    <Link href={`/guia/${guia.slug}`} className={`${classe} ${className}`}>
      ❓ Passo a passo: {guia.titulo.toLowerCase()}
    </Link>
  );
}
