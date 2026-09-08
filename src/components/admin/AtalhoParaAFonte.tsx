import Link from "next/link";
import { fonteDe } from "@/lib/fontes-de-dados";

/**
 * O CAMINHO PARA A FONTE, na tela do módulo.
 *
 * Pedido do dono (08/09/2026): "deixar em um único lugar tudo que faz
 * referência a importar a base, ou que ligue a um link, ou que precise
 * informar a atualização".
 *
 * AQUI ANTES MORAVA UMA FAIXA COM O LINK ECOADO. Ela nasceu como meio
 * termo: o formulário da pasta tinha saído, e mostrar para onde a fonte
 * apontava evitava importar da pasta errada sem perceber. Só que ecoar o
 * link em quatro telas é a mesma duplicação que a tela de Fontes veio
 * acabar -- e agora o botão de importar também mora lá, então não há mais
 * nada a decidir aqui: quem quer conferir a fonte vai ao lugar onde ela se
 * configura.
 *
 * Uma linha, não uma faixa. Isto não é um aviso; é uma porta.
 */
export function AtalhoParaAFonte({ chave }: { chave: string }) {
  const fonte = fonteDe(chave);
  if (!fonte) return null;

  return (
    <p className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-snug text-slate-600">
      🔌 A pasta e o botão de importar ficam em{" "}
      <Link
        href={`/admin/fontes-de-dados?aberta=${fonte.chave}#fonte-${fonte.chave}`}
        className="font-semibold text-primary hover:underline"
      >
        Fontes de Dados › {fonte.rotulo}
      </Link>
      . Esta tela mostra o que entrou.
    </p>
  );
}
