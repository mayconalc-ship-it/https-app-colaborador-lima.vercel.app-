import Link from "next/link";
import { ComMarcas } from "@/components/Icone";

/**
 * AS ABAS DA GESTÃO DE ACESSO.
 *
 * Ponto 4 do diagnóstico (06/09/2026). "Acessos por Pessoa" e "Perfis de
 * Acesso" gravam nas MESMAS linhas e o dono já perguntou se não eram
 * módulos duplicados. Eram duas portas para o mesmo cômodo, cada uma num
 * canto da barra lateral, e a primeira ainda acumulava três liberações
 * diferentes numa rolagem só.
 *
 * AS ROTAS CONTINUAM DUAS, de propósito -- e é a única parte deste ajuste
 * que não é cosmética. As duas telas têm PORTAS DIFERENTES: Acessos por
 * Pessoa é exclusiva do dono (é o que impede uma liderança de aumentar o
 * próprio poder), enquanto Perfis de Acesso é delegável, com a concessão
 * `perfis-acesso`. Fundir as rotas obrigaria a escolher: ou trancar
 * Perfis atrás do dono -- e aí a concessão `perfis-acesso` vira uma caixa
 * que não faz nada --, ou abrir Acessos a quem tem Perfis, que é
 * exatamente o caminho para alguém ampliar o próprio acesso.
 *
 * Então elas continuam duas rotas e se comportam como uma tela: a mesma
 * barra em cima, sempre com o mesmo lugar para cada coisa.
 *
 * PESSOAS VEM PRIMEIRO (05/10/2026, redesenho da Gestão de Acessos). A
 * pergunta mais frequente é "o que Fulano pode?", e é a única que a tela
 * responde por alguém em particular. Os perfis são a segunda: "o que o
 * conferente precisa?". As abas não levam mais a revenda na URL -- a
 * revenda é a do app, a mesma em todas (ver BarraDaRevenda).
 */
export type AbaDeAcesso = "pessoa" | "perfil" | "modulos" | "limpeza";

const ABAS: {
  id: AbaDeAcesso;
  rotulo: string;
  emoji: string;
  ajuda: string;
  href: string;
}[] = [
  {
    id: "pessoa",
    rotulo: "Pessoas",
    emoji: "👥",
    ajuda: "Toque numa pessoa para ver tudo o que ela pode — e de onde vem cada acesso.",
    href: "/admin/acessos",
  },
  {
    id: "perfil",
    rotulo: "Perfis",
    emoji: "🎫",
    ajuda: "O pacote de acessos de um cargo. Mudou o perfil, mudou para todo mundo que está nele.",
    href: "/admin/perfis-de-acesso",
  },
  {
    id: "modulos",
    rotulo: "Em massa",
    emoji: "🔓",
    ajuda: "Várias pessoas de uma vez, numa grade: módulos do app e análises da Gestão.",
    href: "/admin/acessos?aba=modulos",
  },
  {
    // 16/09/2026: o que está liberado e ninguém usa, e quem não entra mais.
    id: "limpeza",
    rotulo: "Revisão",
    emoji: "🧹",
    ajuda: "O que está liberado e ninguém usa, e quem não entra mais no app.",
    href: "/admin/acessos/limpeza",
  },
];

export function AbasDeAcesso({
  atual,
  mostrarPerfis = true,
}: {
  atual: AbaDeAcesso;
  /**
   * Desde 11/09/2026 a Gestão de Acessos também abre para a liderança que
   * tem o módulo "acessos" -- e ela pode não ter `perfis-acesso`. A aba
   * some para quem não pode abri-la, em vez de levar a um "sem permissão".
   */
  mostrarPerfis?: boolean;
}) {
  const daVez = ABAS.find((a) => a.id === atual);
  const abas = mostrarPerfis ? ABAS : ABAS.filter((a) => a.id !== "perfil");

  return (
    <div className="mb-4">
      {/* Abas de verdade, numa linha só que rola de lado no celular --
          quatro botões soltos quebravam em duas linhas e pareciam filtros. */}
      <nav
        aria-label="Seções da Gestão de Acessos"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {abas.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            aria-current={a.id === atual ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
              a.id === atual
                ? "border-primary font-bold text-primary-dark"
                : "border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            <ComMarcas texto={a.emoji ?? ""} /> {a.rotulo}
          </Link>
        ))}
      </nav>
      {/* A frase da aba ABERTA, e só dela. Explicar as três de uma vez foi
          o que já se tentou com três cartões no topo -- e o dono continuou
          sem achar o que procurava. Uma aba por vez, uma frase por vez. */}
      {daVez && <p className="mt-2 text-xs text-slate-500">{daVez.ajuda}</p>}
    </div>
  );
}
