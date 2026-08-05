"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const caminho = usePathname();

  // No modo de gestão a faixa dourada já traz "Voltar para o app" e
  // "Voltar ao Painel". Um terceiro botão de voltar, com destino parecido,
  // só faz a pessoa parar para escolher.
  const noModoGestao = caminho?.startsWith("/admin");

  return (
    <div className="mb-6">
      {!noModoGestao && (
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          ← Voltar ao menu
        </Link>
      )}
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
    </div>
  );
}
