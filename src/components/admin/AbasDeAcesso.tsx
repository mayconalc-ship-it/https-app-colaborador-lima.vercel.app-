import Link from "next/link";

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
 * Hoje ninguém tem `perfis-acesso` concedido (conferido na base,
 * 06/09/2026): só o dono chega às duas. Mas "ninguém usa hoje" não é
 * motivo para tirar a possibilidade -- seria trocar uma tela confusa por
 * uma decisão de segurança tomada de lado.
 *
 * Então elas continuam duas rotas e passam a se comportar como uma tela:
 * a mesma barra em cima, sempre com o mesmo lugar para cada coisa.
 */
export type AbaDeAcesso = "perfil" | "pessoa" | "modulos";

const ABAS: {
  id: AbaDeAcesso;
  rotulo: string;
  emoji: string;
  ajuda: string;
  href: (revendaId?: string) => string;
}[] = [
  {
    id: "perfil",
    rotulo: "Por perfil",
    emoji: "🎫",
    ajuda: "O molde de um cargo, com nome. É por aqui que se começa.",
    href: () => "/admin/perfis-de-acesso",
  },
  {
    id: "pessoa",
    rotulo: "Por pessoa",
    emoji: "👤",
    ajuda: "A ficha de cada liderança: o perfil dela e as exceções.",
    href: (r) => (r ? `/admin/acessos?revenda=${r}` : "/admin/acessos"),
  },
  {
    id: "modulos",
    rotulo: "Módulos e análises",
    emoji: "🔓",
    ajuda: "As duas grades: o cartão no app, e os relatórios da Gestão.",
    href: (r) =>
      r ? `/admin/acessos?aba=modulos&revenda=${r}` : "/admin/acessos?aba=modulos",
  },
];

export function AbasDeAcesso({
  atual,
  revendaId,
  mostrarPerfis = true,
}: {
  atual: AbaDeAcesso;
  revendaId?: string;
  /**
   * Desde 11/09/2026 Acessos por Pessoa também abre para a liderança que
   * tem o módulo "acessos" -- e ela pode não ter `perfis-acesso`. A aba
   * some para quem não pode abri-la, em vez de levar a um "sem permissão".
   */
  mostrarPerfis?: boolean;
}) {
  const daVez = ABAS.find((a) => a.id === atual);
  const abas = mostrarPerfis ? ABAS : ABAS.filter((a) => a.id !== "perfil");

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {abas.map((a) => (
          <Link
            key={a.id}
            href={a.href(revendaId)}
            aria-current={a.id === atual ? "page" : undefined}
            className={
              a.id === atual
                ? "rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary"
            }
          >
            {a.emoji} {a.rotulo}
          </Link>
        ))}
      </div>
      {/* A frase da aba ABERTA, e só dela. Explicar as três de uma vez foi
          o que já se tentou com três cartões no topo -- e o dono continuou
          sem achar o que procurava. Uma aba por vez, uma frase por vez. */}
      {daVez && <p className="mt-2 text-xs text-slate-500">{daVez.ajuda}</p>}
    </div>
  );
}
