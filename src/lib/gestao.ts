import type { ModuloId } from "./acessos";

/**
 * A área de Gestão: onde ficam as telas que a liderança LÊ para decidir.
 *
 * O diagnóstico apontou dois problemas diferentes, e é importante não
 * confundi-los:
 *
 *   1. Telas de gestão moravam dentro do app do colaborador. Quem
 *      administra tinha de atravessar o app de quem opera para chegar
 *      num painel que não é para operar. Foi assim que 12 colaboradores
 *      acabaram enxergando o ranking de produtividade dos colegas
 *      (corrigido na etapa 1).
 *
 *   2. No Modo Liderança, o que se LÊ estava misturado com o que se
 *      CONFIGURA. "Uso do App" e "Cadastrar produto" moravam na mesma
 *      barra, e a barra não dizia qual era qual.
 *
 * Daí a linha desta área: Gestão é ACOMPANHAR, o Modo Liderança é
 * CONFIGURAR e PUBLICAR. Um painel só entra aqui quando responde a uma
 * pergunta -- nunca quando cadastra alguma coisa.
 *
 * NENHUMA permissão nova nasce aqui. Cada painel continua atrás da
 * permissão do módulo dele, exatamente a mesma de antes. Esta área é
 * endereço, não porta.
 */

export type PainelId =
  | "anomalias"
  | "armazem"
  | "gas"
  | "cinco-s"
  | "feedbacks"
  | "justificativas"
  | "uso-do-app";

export type BlocoDaGestao = "Operação" | "Pessoas";

export const BLOCOS_DA_GESTAO: BlocoDaGestao[] = ["Operação", "Pessoas"];

export type Painel = {
  id: PainelId;
  rotulo: string;
  emoji: string;
  href: string;
  bloco: BlocoDaGestao;
  /** O módulo cuja concessão de "ver" abre este painel. */
  modulo: ModuloId;
  /**
   * A pergunta que o painel responde, em uma linha.
   *
   * Não é enfeite: o painel inicial lista seis cartões parecidos, e sem a
   * pergunta a escolha vira adivinhação pelo nome. "5S" não diz se mostra
   * a nota do mês ou a lista de ações pendentes.
   */
  pergunta: string;
  /**
   * O painel MORA em /gestao (a rota antiga passa a redirecionar) ou é só
   * um atalho para a tela que continua onde está?
   *
   * Nem todo painel devia se mudar. Os dados dos ultimos 60 dias mostram
   * que o BI do 5S e o painel de gás são abertos por quem OPERA -- dono de
   * área conferindo a nota da própria área, operador de empilhadeira
   * olhando a própria máquina. Trazê-los para cá os poria atrás de
   * `requireGestor` e tiraria a tela de quem a usa todo dia. Continuam
   * onde estão, com o acesso que já tinham; aqui viram atalho, para a
   * liderança achar sem atravessar o app do colaborador.
   */
  mora: boolean;
  /** Endereço antigo, que passa a redirecionar. Só para quem se mudou. */
  antigo?: string;
};

export const PAINEIS: Painel[] = [
  {
    // PRIMEIRO DA LISTA, e de propósito: é o único painel que traz
    // TAREFA, não leitura. Os outros respondem "como foi"; este diz "o
    // que está te esperando". Um painel de pendência no meio da lista é
    // um painel que se abre depois -- e pendência que se vê depois é a
    // que vira crônica.
    id: "anomalias",
    rotulo: "Anomalias",
    emoji: "🚨",
    href: "/gestao/anomalias",
    bloco: "Operação",
    modulo: "relato-anomalia",
    pergunta: "Que indicador saiu da faixa e qual relato está esperando você.",
    mora: true,
  },
  {
    id: "armazem",
    rotulo: "Produtividade do Armazém",
    emoji: "🏭",
    href: "/gestao/armazem",
    bloco: "Operação",
    modulo: "produtividade-armazem",
    pergunta: "Quanto o armazém produziu, por pessoa e contra a meta.",
    mora: true,
    antigo: "/produtividade-armazem/indicadores",
  },
  {
    id: "gas",
    rotulo: "Gás da Empilhadeira",
    emoji: "⛽",
    href: "/produtividade-armazem/empilhadeira/gas",
    bloco: "Operação",
    modulo: "pa-empilhadeira",
    pergunta: "Quanto cada máquina consome e quanto dura um botijão.",
    mora: false,
  },
  {
    id: "cinco-s",
    rotulo: "BI do 5S",
    emoji: "🧹",
    href: "/5s/bi",
    bloco: "Operação",
    modulo: "5s",
    pergunta: "A nota de cada área no mês e onde ela cai.",
    mora: false,
  },
  {
    id: "feedbacks",
    rotulo: "Feedbacks das Rotas",
    emoji: "📝",
    href: "/gestao/feedbacks",
    bloco: "Pessoas",
    modulo: "feedbacks",
    pergunta: "O que o motorista disse da rota, e o que já foi tratado.",
    mora: true,
    antigo: "/admin/feedbacks",
  },
  {
    id: "justificativas",
    rotulo: "Justificativas",
    emoji: "🗣️",
    href: "/gestao/justificativas",
    bloco: "Pessoas",
    modulo: "justificativas",
    pergunta: "Por que a meta não foi batida, na palavra de quem não bateu.",
    mora: true,
    antigo: "/admin/justificativas",
  },
  {
    id: "uso-do-app",
    rotulo: "Uso do App",
    emoji: "📱",
    href: "/gestao/uso-do-app",
    bloco: "Pessoas",
    modulo: "metricas",
    pergunta: "Quem entra, com que frequência e em quais telas.",
    mora: true,
    antigo: "/admin/metricas",
  },
];

/** Módulos cuja tela saiu do Modo Liderança e passou a morar na Gestão. */
export const MODULOS_QUE_MUDARAM: ModuloId[] = PAINEIS.filter((p) => p.mora && p.antigo?.startsWith("/admin/")).map(
  (p) => p.modulo,
);

export function painelPorId(id: string) {
  return PAINEIS.find((p) => p.id === id);
}

/** Os redirects do next.config: endereço antigo -> endereço novo. */
export function mudancasDeEndereco() {
  return [
    ...PAINEIS.filter((p) => p.mora && p.antigo).map((p) => ({
      source: p.antigo!,
      destination: p.href,
      // 308: quem salvou o atalho antigo continua chegando, para sempre.
      // Mover rota quebra atalho salvo, e no celular do time o atalho da
      // tela inicial e o unico caminho que muita gente usa.
      permanent: true,
    })),
    {
      // O ressuprimento teve tela propria por um dia (migration 085) e foi
      // dobrado dentro do Abastecimento na 086 -- e a mesma coisa, disse o
      // dono, e ele tem razao. Quem tiver aberto o link naquele dia
      // continua chegando no lugar certo.
      source: "/produtividade-armazem/ressuprimento",
      destination: "/produtividade-armazem/abastecimento",
      permanent: true,
    },
  ];
}
