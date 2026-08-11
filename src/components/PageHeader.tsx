"use client";

import { usePathname } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

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
        <LinkVoltar href="/" className="mb-1 text-primary hover:underline">
          ← Voltar ao menu
        </LinkVoltar>
      )}
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
    </div>
  );
}
