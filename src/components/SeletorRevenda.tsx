import Link from "next/link";
import { getRevendas, getRevendaAtiva } from "@/lib/revendas";

/**
 * No celular só cabe o que distingue uma revenda da outra: "Revenda Lima"
 * é igual em todas e só empurra o nome de verdade para fora da tela.
 */
function nomeCurto(nome: string) {
  return nome.replace(/^Revenda\s+Lima\s+/i, "");
}

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
      className="max-w-[7.5rem] truncate rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20 sm:max-w-none"
    >
      🏢{" "}
      <span className="sm:hidden">{nomeCurto(atual.nome)}</span>
      <span className="hidden sm:inline">{atual.nome}</span>
    </Link>
  );
}
