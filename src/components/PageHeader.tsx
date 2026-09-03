"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LinkVoltar } from "@/components/LinkVoltar";

export function PageHeader({
  title,
  subtitle,
  fecharHref,
}: {
  title: string;
  subtitle?: string;
  /**
   * Onde o "✕" cai QUANDO NÃO HÁ DE ONDE VOLTAR -- link aberto direto,
   * aba nova, atalho salvo na tela inicial. É o pai imediato da tela.
   *
   * Passar isto também é o que troca o "← Voltar ao menu" pelo "✕": telas
   * de entrada de módulo (alcançadas a partir do menu principal) não
   * passam nada e mantêm o voltar de sempre. As duas nunca aparecem
   * juntas -- é exatamente a duplicidade que este parâmetro evita.
   */
  fecharHref?: string;
}) {
  const caminho = usePathname();
  const router = useRouter();

  // No modo de gestão a faixa dourada já traz o "Voltar ao Painel", e o
  // topo traz a saída para o app. Um terceiro botão de voltar, com destino
  // parecido, só faz a pessoa parar para escolher.
  const noModoGestao = caminho?.startsWith("/admin");

  /**
   * O ✕ VOLTA PARA A TELA ANTERIOR -- pedido do dono.
   *
   * Antes ele era um link fixo para o pai declarado, e isso fazia o
   * caminho de volta discordar do caminho de ida: quem chegou ao Repack
   * pela Gestão de Dados era jogado na vitrine do Armazém, uma tela por
   * onde não passou.
   *
   * `fecharHref` continua sendo o href do link, e não vira adorno: é ele
   * que responde quando NÃO há histórico (aba nova, link colado, atalho
   * da tela inicial). Sem essa rede, `router.back()` levaria a pessoa
   * para fora do app -- ou para lugar nenhum.
   */
  function fechar(e: React.MouseEvent) {
    // `length > 1` significa que existe alguma coisa atrás nesta aba.
    if (typeof window !== "undefined" && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <div className="relative mb-6">
      {fecharHref ? (
        <Link
          href={fecharHref}
          onClick={fechar}
          aria-label="Fechar e voltar"
          title="Voltar para a tela anterior"
          className="toque-texto absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-bold leading-none text-slate-600 shadow-sm hover:bg-slate-200 hover:text-slate-900 active:bg-slate-200"
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
