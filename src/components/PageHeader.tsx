"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

export function PageHeader({
  title,
  subtitle,
  fecharHref,
}: {
  title: string;
  subtitle?: string;
  /**
   * Telas abertas a partir de um submenu (ex.: Repack, aberto a partir de
   * Produtividade do Armazém) passam o caminho do submenu aqui -- troca o
   * "Voltar ao menu" por um "✕" que fecha para ESSE pai imediato, em vez
   * de pular direto para o início. Telas de entrada de módulo (o próprio
   * submenu, alcançado a partir do menu principal) não passam nada e
   * mantêm o "Voltar ao menu" de sempre. As duas nunca aparecem juntas --
   * é exatamente a duplicidade que este parâmetro evita.
   */
  fecharHref?: string;
}) {
  const caminho = usePathname();

  // No modo de gestão a faixa dourada já traz o "Voltar ao Painel", e o
  // topo traz a saída para o app. Um terceiro botão de voltar, com destino
  // parecido, só faz a pessoa parar para escolher.
  const noModoGestao = caminho?.startsWith("/admin");

  return (
    <div className="relative mb-6">
      {fecharHref ? (
        <Link
          href={fecharHref}
          aria-label="Fechar"
          className="toque-texto absolute -right-1 -top-1 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-xl font-bold leading-none text-red-600 shadow-sm hover:bg-red-200 hover:text-red-700 active:bg-red-200"
        >
          ✕
        </Link>
      ) : (
        !noModoGestao && (
          <LinkVoltar href="/" className="mb-1 text-primary hover:underline">
            ← Voltar ao menu
          </LinkVoltar>
        )
      )}
      <h1 className={`text-2xl font-bold text-slate-900 ${fecharHref ? "pr-12" : ""}`}>{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
    </div>
  );
}
