import Link from "next/link";
import { getRevendas, getRevendaAtiva } from "@/lib/revendas";
import { siglaRevenda, nomeCurtoRevenda } from "@/lib/revenda-sigla";
import { corDaRevenda } from "@/lib/revenda-cor";

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
      {/* A cor da revenda, a mesma da faixa da Gestão de Acessos: o olho
          reconhece a unidade antes de ler o nome. Só do tablet para cima:
          no celular o cabeçalho tem 8px de folga, e a bolinha custa 12. */}
      <span
        aria-hidden="true"
        className={`mr-1 hidden h-2 w-2 rounded-full align-middle ring-1 ring-white/70 sm:inline-block ${corDaRevenda(atual.slug).ponto}`}
      />
      {/* Celular: só a sigla. Do tablet para cima cabe o nome inteiro. */}
      <span className="sm:hidden">{siglaRevenda(atual.slug, atual.nome)}</span>
      <span className="hidden sm:inline">
        {nomeCurtoRevenda(atual.nome)}
      </span>
    </Link>
  );
}
