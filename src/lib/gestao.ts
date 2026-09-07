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
  | "pdv"
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
    /*
      SEGUNDO DA LISTA, e também por ser tarefa: o bloqueio tem prazo
      correndo, e quem monitora rota precisa ver antes de a carga sair.

      Pedido do dono (07/09/2026): "coloque as particularidades de PDV na
      home somente com as informações de leitura, para acompanhar sem
      precisar ir em ADM (...) para que o monitoramento de rota saiba e
      possa atuar na preventiva. E apenas as configurações precisa estar
      na liderança".
    */
    id: "pdv",
    rotulo: "Particularidades do PDV",
    emoji: "📍",
    href: "/gestao/pdv",
    bloco: "Operação",
    modulo: "pdv-particularidades",
    pergunta: "Que cliente está bloqueado, e o que cada rota precisa saber antes de sair.",
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

/**
 * QUAL ANÁLISE CADA MÓDULO ABRE -- para a tela de acessos poder dizer isso.
 *
 * Nenhuma permissão nova: a análise SEMPRE esteve atrás do "Visualizar" do
 * módulo dela. O que faltava era a tela de acessos DIZER isso. Numa lista
 * de trinta módulos, quem libera "Uso do App" não tinha como saber que
 * estava abrindo um painel na Gestão -- e quem queria abrir um painel não
 * sabia qual módulo marcar.
 *
 * Um módulo pode abrir mais de uma análise (é o caso de nenhum hoje, mas o
 * mapa é uma lista para não precisar ser reescrito quando for).
 */
export function paineisDoModulo(modulo: ModuloId): Painel[] {
  return PAINEIS.filter((p) => p.modulo === modulo);
}

/** Os módulos que abrem alguma análise -- a legenda da tela de acessos. */
export const MODULOS_COM_ANALISE: ModuloId[] = [...new Set(PAINEIS.map((p) => p.modulo))];

/**
 * AS ANÁLISES QUE UMA PESSOA VÊ -- a regra, num lugar só.
 *
 * Estava dentro de `paineisVisiveis`, que só sabe olhar para QUEM ESTÁ
 * LOGADO. A prévia de acesso ("ver como esta pessoa vê") precisa
 * responder o mesmo sobre OUTRA pessoa, e uma prévia que reimplementa a
 * regra mente na primeira mudança.
 *
 * Duas perguntas, as mesmas do Modo Liderança: a revenda usa o módulo? e
 * esta pessoa pode abri-lo? A primeira vale até para o dono.
 */
export function paineisPara(
  modulosDaRevenda: Set<string>,
  podeVer: (modulo: ModuloId) => boolean,
): Painel[] {
  return PAINEIS.filter((p) => modulosDaRevenda.has(p.modulo) && podeVer(p.modulo));
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
