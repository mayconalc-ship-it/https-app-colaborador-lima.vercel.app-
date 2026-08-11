import Link from "next/link";
import { getRevendas, getRevendaAtiva } from "@/lib/revendas";
import { siglaRevenda, nomeCurtoRevenda } from "@/lib/revenda-sigla";

/**
 * Mostra em qual revenda a pessoa está e abre a troca.
 *
 * Só aparece para quem tem mais de um vínculo. Para a imensa maioria --
 * que é de uma revenda só -- não há escolha a fazer, e um seletor com uma
 * opção seria ruído ocupando o espaço escasso do cabeçalho no celular.
 */
export async function SeletorRevenda() {
  const [revendas, atual] = await Promise.all([getRevendas(), getRevendaAtiva()]);

  if (revendas.length <= 1 || !atual) return null;

  return (
    <Link
      href="/escolher-revenda"
      title={`Você está em ${atual.nome}. Toque para trocar.`}
      className="shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20"
    >
      🏢{" "}
      {/* Celular: só a sigla. Do tablet para cima cabe o nome inteiro. */}
      <span className="sm:hidden">{siglaRevenda(atual.slug, atual.nome)}</span>
      <span className="hidden sm:inline">
        {nomeCurtoRevenda(atual.nome)}
      </span>
    </Link>
  );
}
