/**
 * Mapa de permissões do app.
 *
 * Três papéis, e a diferença entre eles é o QUANTO, não o QUE:
 *   colaborador - só usa o app
 *   lideranca   - usa o app E entra no Modo Liderança, com exatamente os
 *                 módulos e ações que o dono liberou para ela
 *   owner       - o dono. Tudo, mais as telas críticas de acesso e auditoria
 *
 * Este arquivo é a única fonte da verdade. As telas e as ações de servidor
 * consultam daqui.
 */

export type Papel = "owner" | "lideranca" | "colaborador";

export type Acao = "ver" | "criar" | "editar" | "excluir" | "promover";

export type ModuloId =
  | "comunicados"
  | "ranking"
  | "padroes"
  | "sonho"
  | "escala"
  | "rv"
  | "colaboradores"
  | "feedbacks"
  | "metricas"
  | "pesquisa"
  | "menu"
  | "rotas"
  | "ativo-giro"
  | "quiz"
  | "5s"
  | "produtividade-armazem"
  | "pa-reepack"
  | "pa-despejo"
  | "pa-empilhadeira"
  | "pa-recebimento"
  | "pa-cinco-s"
  | "pa-picking"
  | "pa-bate-palete"
  | "carretas-portaria"
  | "carretas-conferencia"
  | "carretas-descarga"
  | "fefo"
  | "fefo-controle"
  | "rating"
  | "refugo"
  | "devolucao"
  | "meus-indicadores"
  | "justificativas"
  | "relato-anomalia"
  | "pdv-particularidades"
  | "metas"
  | "fontes-dados"
  | "perfis-acesso";

/**
 * As gavetas do Modo Liderança, na ordem em que aparecem.
 *
 * A ordem não é alfabética: é a do dia de quem administra. Comunicação e
 * Engajamento são o que se publica; Gestão de Dados é onde os
 * indicadores são ALIMENTADOS (importar relatório, cadastrar valor,
 * ajustar meta) -- ler indicador é na área de Gestão, /gestao; Pessoas e
 * Configuração são os menos frequentes e ficam no fim.
 *
 * "Operação" continua existindo como grupo porque os sub-módulos do
 * armazém (pa-*, carretas-*, fefo) se penduram nela na tabela de acessos
 * e em Perfis de Acesso -- mas ela não tem mais item PRÓPRIO na barra:
 * Ativo de Giro, 5S e Produtividade do Armazém são telas de CADASTRO e
 * foram para Configuração; a pré-rota é importação e foi para Gestão de
 * Dados. A gaveta some sozinha quando fica sem item.
 */
export const GRUPOS_DO_ADMIN = [
  "Comunicação",
  "Engajamento",
  "Gestão de Dados",
  "Operação",
  "Pessoas",
  "Configuração",
] as const;

export type GrupoDoAdmin = (typeof GRUPOS_DO_ADMIN)[number];

/** Emoji de cada gaveta, para a barra não ser só uma lista de texto. */
export const EMOJI_GRUPO_ADMIN: Record<GrupoDoAdmin, string> = {
  "Comunicação": "📣",
  "Engajamento": "🎯",
  // Arquivo, não gráfico: 📊 virou o ícone da ÁREA de Gestão (/gestao),
  // que é onde se lê indicador. Aqui é onde ele é alimentado.
  "Gestão de Dados": "🗄️",
  "Operação": "🏭",
  "Pessoas": "👥",
  "Configuração": "⚙️",
};

export type Modulo = {
  id: ModuloId;
  rotulo: string;
  emoji: string;
  href: string;
  /**
   * A gaveta do módulo na barra do Modo Liderança.
   *
   * Eram duas ("Conteúdo do app" e "Pessoas e configuração"), e a primeira
   * acumulou 27 itens de naturezas diferentes: publicar comunicado,
   * importar planilha, cadastrar produto e ler justificativa de motorista
   * moravam juntos. O nome não descrevia nenhum deles.
   *
   * As seis abaixo são a natureza REAL do que a tela faz. A ordem em que
   * aparecem está em GRUPOS_DO_ADMIN, logo abaixo.
   */
  grupo: GrupoDoAdmin;
  /** Só as ações que fazem sentido neste módulo. */
  acoes: Acao[];
  /**
   * Agrupa este módulo sob um "módulo guarda-chuva" na tabela de acesso
   * opcional (ver GRUPOS_OPCIONAIS abaixo) -- é o que permite liberar cada
   * funcionalidade de Produtividade do Armazém pessoa a pessoa, mas com as
   * colunas organizadas juntas em vez de espalhadas soltas na tabela.
   */
  subGrupoDe?: ModuloId;
  /**
   * Este módulo NÃO tem tela de Admin própria -- fica fora da barra
   * lateral do Modo Liderança, mas continua nos Acessos por Pessoa para ser
   * liberado pessoa a pessoa.
   *
   * Sem isto o item entrava na barra apontando para a tela do colaborador,
   * e clicar nele jogava o gestor para fora do Admin.
   */
  semTelaAdmin?: boolean;
  /**
   * A tela deste módulo mora na área de GESTÃO (/gestao), não no Modo
   * Liderança. Fica fora da barra do Admin -- a barra da Gestão a mostra,
   * montada a partir de PAINEIS em lib/gestao.ts.
   *
   * A concessão continua sendo a mesma, com o mesmo nome, no mesmo lugar
   * dos Acessos por Pessoa: mudou o endereço da tela, não a permissão.
   */
  emGestao?: boolean;
  /**
   * O QUE CADA AÇÃO DESTRAVA NESTE MÓDULO -- em vez de "Criar/Editar".
   *
   * Pedido do dono (05/09/2026): "eu que crio o app fico confuso em o que
   * liberar às vezes". E a causa está aqui: as quatro palavras genéricas
   * significam coisas diferentes em cada módulo, e uma delas significa
   * três coisas ao mesmo tempo.
   *
   * "Criar" em Refugo é IMPORTAR O RELATÓRIO. "Editar" em Refugo é
   * CADASTRAR O VALOR DOS MATERIAIS. São verbos que não se deduzem do
   * rótulo, e quem concede fica escolhendo no escuro -- ou libera demais
   * por precaução, que é o pior dos dois erros.
   *
   * "Ver" é o pior de todos: em módulo opcional ele libera o CARTÃO no app
   * do colaborador; em módulo de liderança, abre a TELA DE ADMINISTRAÇÃO;
   * e em sete deles abre também a ANÁLISE da Gestão. Mesma palavra, três
   * resultados.
   *
   * Os rótulos abaixo saíram do código, não de suposição: foram lidos das
   * chamadas de `requireModulo`/`podeNoModulo` de cada ação, função por
   * função. Nada muda no banco -- a concessão gravada continua
   * `modulo:acao`.
   */
  rotulosDeAcao?: Partial<Record<Acao, string>>;
  /**
   * A TELA DE ADMIN DESTE MÓDULO EXIGE "EDITAR", não "ver".
   *
   * Existe porque em alguns módulos as duas coisas se separaram: o "ver"
   * abre a ANÁLISE (leitura, na Gestão e na home) e o "editar" abre o
   * CADASTRO (no Modo Liderança). Foi o pedido do dono para as
   * Particularidades do PDV, 07/09/2026: "apenas as configurações precisa
   * estar na liderança".
   *
   * Sem esta marca a barra lateral ofereceria a tela de cadastro a quem só
   * pode ler -- e o clique terminaria num "sem permissão", que é a pior
   * forma de dizer não: depois de o caminho ter sido oferecido.
   */
  exigeEditarNoAdmin?: boolean;
};

/** O rótulo desta ação NESTE módulo, com o genérico como reserva. */
export function rotuloDaAcaoNoModulo(m: Modulo, acao: Acao): string {
  return m.rotulosDeAcao?.[acao] ?? ROTULO_ACAO[acao];
}

export const MODULOS: Modulo[] = [
  {
    id: "comunicados",
    rotulosDeAcao: {
      ver: "Abrir o Jornal no Modo Liderança (e no app)",
      criar: "Publicar comunicado e criar editoria",
      editar: "Editar comunicado e editoria já publicados",
      excluir: "Apagar comunicado e editoria",
    },
    rotulo: "Jornal / Comunicados",
    emoji: "📰",
    href: "/admin/comunicados",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "ranking",
    rotulosDeAcao: {
      ver: "Abrir o Ranking no Modo Liderança (e no app)",
      criar: "Lançar o ranking da rodada",
      editar: "Corrigir ranking já lançado",
      excluir: "Apagar ranking",
    },
    rotulo: "Ranking Super Matinal",
    emoji: "🏆",
    href: "/admin/ranking",
    grupo: "Engajamento",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "padroes",
    rotulosDeAcao: {
      ver: "Abrir Padrões no Modo Liderança (e no app)",
      criar: "Publicar padrão novo",
      editar: "Editar padrão publicado",
      excluir: "Apagar padrão",
    },
    rotulo: "Padrões",
    emoji: "📋",
    href: "/admin/padroes",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "sonho",
    rotulosDeAcao: {
      ver: "Abrir o Sonho no Modo Liderança (e no app)",
      criar: "Publicar o sonho da revenda",
      editar: "Editar o sonho publicado",
      excluir: "Apagar o sonho",
    },
    rotulo: "Sonho da Revenda",
    emoji: "🎯",
    href: "/admin/sonho-da-revenda",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "rating",
    rotulosDeAcao: {
      ver: "Abrir o Rating no Modo Liderança (e no app)",
      criar: "Importar o relatório de entregas do Drive",
    },
    rotulo: "Rating de Entrega",
    emoji: "⭐",
    href: "/admin/rating",
    grupo: "Gestão de Dados",
    // "criar" = importar os relatórios do Drive. O motorista e o ajudante
    // só veem as PRÓPRIAS avaliações, e para isso basta a concessão do
    // módulo (sem ação) -- quem não entrega não tem o que ver aqui.
    acoes: ["ver", "criar"],
  },
  {
    id: "meus-indicadores",
    rotulosDeAcao: {
      ver: "Ver a vitrine Meus Indicadores no app",
    },
    rotulo: "Meus Indicadores",
    emoji: "📊",
    // Não tem tela de Admin própria: o que se administra são os três
    // módulos de dentro (Rating, Refugo, Devolução), cada um com a sua.
    // Esta concessão só abre a vitrine.
    href: "/meus-indicadores",
    grupo: "Gestão de Dados",
    acoes: ["ver"],
    semTelaAdmin: true,
  },
  {
    id: "fontes-dados",
    rotulosDeAcao: {
      ver: "Abrir a lista de Fontes de Dados",
    },
    rotulo: "Fontes de Dados",
    emoji: "🔌",
    href: "/admin/fontes-de-dados",
    grupo: "Configuração",
    // Só "ver": a tela lista todas as fontes, mas a EDIÇÃO de cada uma
    // herda a permissão do módulo dela (quem podia importar o Rating
    // continua sendo quem configura a fonte do Rating). Sem isso, esta
    // concessão viraria um atalho para configurar módulos que a pessoa
    // não administra.
    acoes: ["ver"],
  },
  {
    id: "relato-anomalia",
    rotulosDeAcao: {
      ver: "📊 Abrir o painel de Anomalias e as blitz",
      editar: "Configurar gatilhos, tratar relato e blitz",
    },
    rotulo: "Relato de Anomalia",
    emoji: "🚨",
    href: "/admin/relato-anomalia",
    grupo: "Configuração",
    // Módulo PRÓPRIO, e não um pedaço da Produtividade do Armazém: o
    // gatilho vigia indicadores de todas as áreas (entrega, bancada,
    // recebimento), e quem trata a anomalia é a liderança imediata
    // daquela área -- não necessariamente quem administra o armazém.
    //
    // Sem "excluir": relato de anomalia não se apaga. Ele é a evidência
    // de que o desvio foi tratado, e apagar um seria exatamente o que o
    // auditor procura. O que existe é encerrar.
    //
    // E sem "criar", desde 05/09/2026: quem abre relato é a VARREDURA, não
    // uma pessoa -- e nenhuma ação do módulo checava essa concessão.
    // Era uma caixa que não fazia nada, do tipo que faz quem concede
    // desconfiar de todas as outras. Ninguém a tinha marcada.
    acoes: ["ver", "editar"],
  },
  {
    id: "pdv-particularidades",
    rotulo: "Particularidades do PDV",
    emoji: "📍",
    href: "/admin/pdv-particularidades",
    // Em Configuração (pedido do dono, 06/09/2026). Eu o havia posto em
    // Gestão de Dados por causa da origem -- o cliente detrator sai do
    // Rating --, mas origem não é natureza: as gavetas separam pelo que a
    // TELA FAZ, e esta cadastra. Gestão de Dados é onde indicador é
    // ALIMENTADO (importar relatório, lançar valor); aqui não entra número
    // nenhum, entra o que a operação sabe sobre cada cliente -- irmão de
    // Ativo de Giro e dos catálogos do Armazém.
    grupo: "Configuração",
    rotulosDeAcao: {
      // AS DUAS CHAVES SÃO DIFERENTES desde 07/09/2026: quem monitora rota
      // lê o dia inteiro e não mexe no cadastro que a operação consulta.
      ver: "📊 Ver a análise: bloqueios e particularidades por cidade",
      criar: "Cadastrar particularidade de um cliente",
      editar: "Abrir o cadastro no Modo Liderança: editar, resolver e criar categorias",
      // Apagar existe para o erro de digitação, e só. O caminho normal é
      // RESOLVER: a particularidade vira histórico, que é o que responde
      // "esse cliente já ficou bloqueado antes?" na próxima vez.
      excluir: "Apagar particularidade lançada por engano",
    },
    acoes: ["ver", "criar", "editar", "excluir"],
    exigeEditarNoAdmin: true,
  },
  {
    id: "metas",
    rotulosDeAcao: {
      ver: "Abrir a tela de Metas",
      editar: "Alterar o valor das metas",
    },
    rotulo: "Metas",
    emoji: "🎯",
    href: "/admin/metas",
    grupo: "Configuração",
    // Sem "excluir": apagar uma meta é deixar o campo em branco, dentro
    // do próprio cadastro -- não é uma ação separada.
    acoes: ["ver", "editar"],
  },
  {
    id: "justificativas",
    rotulosDeAcao: {
      ver: "📊 Ler as justificativas de meta não batida",
    },
    rotulo: "Justificativas",
    emoji: "🗣️",
    href: "/gestao/justificativas",
    grupo: "Gestão de Dados",
    emGestao: true,
    // Só leitura, e de propósito: a explicação é do colaborador. A
    // liderança lê para tratar, não para editar -- um texto que pode ser
    // mexido por quem foi explicado deixa de ser a versão de quem
    // escreveu.
    acoes: ["ver"],
  },
  {
    id: "devolucao",
    rotulosDeAcao: {
      ver: "Abrir Devolução no Modo Liderança (e no app)",
      criar: "Importar o relatório de devolução",
      editar: "Ajustar a meta e classificar os motivos",
    },
    rotulo: "Devolução",
    emoji: "↩️",
    href: "/admin/devolucao",
    grupo: "Gestão de Dados",
    // "criar" = importar; "editar" = a meta e a classificação dos motivos.
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "refugo",
    rotulosDeAcao: {
      ver: "Abrir Refugo no Modo Liderança (e no app)",
      criar: "Importar o relatório de refugo",
      editar: "Cadastrar o valor dos materiais",
    },
    rotulo: "Refugo de Vasilhame",
    emoji: "♻️",
    href: "/admin/refugo",
    grupo: "Gestão de Dados",
    // "criar" = importar o relatório; "editar" = cadastrar o valor dos
    // materiais. O motorista, o ajudante e o conferente só veem o
    // próprio refugo, e para isso basta a concessão do módulo.
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "rotas",
    rotulosDeAcao: {
      ver: "Abrir a pré-rota no Modo Liderança (e no app)",
      criar: "Importar a planilha da pré-rota",
      excluir: "Apagar a pré-rota importada",
    },
    rotulo: "Minha Rota (pré-rota)",
    emoji: "🚚",
    href: "/admin/rotas",
    // Importação de planilha, como Rating/Refugo/Devolução/RV -- e já
    // aparece como fonte em Fontes de Dados. Ficava em "Operação" e era
    // o único item de importação fora do grupo dos outros.
    grupo: "Gestão de Dados",
    // "criar" = importar a planilha. O colaborador só consulta, e para
    // isso não precisa de permissão nenhuma.
    acoes: ["ver", "criar", "excluir"],
  },
  {
    id: "escala",
    rotulosDeAcao: {
      ver: "Abrir a Escala no Modo Liderança (e no app)",
      editar: "Publicar e trocar o arquivo da escala",
    },
    rotulo: "Escala de Trabalho",
    emoji: "🗓️",
    href: "/admin/escala",
    grupo: "Comunicação",
    acoes: ["ver", "editar"],
  },
  {
    id: "rv",
    rotulosDeAcao: {
      ver: "Abrir a RV no Modo Liderança (e no app)",
      editar: "Apontar a planilha de RV de cada área",
    },
    rotulo: "Remuneração Variável",
    emoji: "💰",
    href: "/admin/rv",
    // Em Configuração, junto de Fontes de Dados (pedido do dono,
    // 03/09/2026). A tela de RV não alimenta indicador nenhum: ela aponta
    // para a planilha de onde a RV é lida, uma por área -- que é
    // exatamente o que Fontes de Dados faz, e onde a RV já aparecia
    // listada. Ter as duas em gavetas diferentes fazia parecer que eram
    // dois assuntos.
    grupo: "Configuração",
    acoes: ["ver", "editar"],
  },
  {
    id: "ativo-giro",
    rotulosDeAcao: {
      ver: "Ver o Ativo de Giro no app",
      criar: "Importar o histórico de contagens",
      editar: "Cadastrar parque e fator, liberar trânsito, pedir recontagem",
      excluir: "Apagar contagem lançada",
    },
    rotulo: "Ativo de Giro",
    emoji: "📦",
    href: "/admin/ativo-de-giro",
    grupo: "Configuração",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "quiz",
    rotulosDeAcao: {
      ver: "Abrir o Desafio no Modo Liderança (e no app)",
      criar: "Criar rodada e pergunta (inclusive com IA)",
      editar: "Publicar, encerrar e mexer nas perguntas da rodada",
      excluir: "Apagar rodada e pergunta",
    },
    // 🏆 já é o Ranking Super Matinal. Aqui o ícone é o do conteúdo --
    // conhecimento -- para as duas telas não virarem a mesma coisa no
    // painel. Para o colaborador o cartão continua sendo o troféu.
    rotulo: "Desafio do Mês",
    emoji: "🧠",
    href: "/admin/quiz",
    grupo: "Engajamento",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "5s",
    rotulosDeAcao: {
      ver: "📊 Abrir o BI do 5S e o módulo no app",
      criar: "Planejar auditoria — do dia, do mês e do ano",
      editar: "Cadastrar área, auditor e pergunta; atribuir ação",
      excluir: "Apagar área",
    },
    rotulo: "Programa 5S",
    emoji: "🧹",
    href: "/admin/5s",
    grupo: "Configuração",
    // "editar" é o que separa quem administra o programa de quem só
    // acompanha: com ele a pessoa cadastra área, planeja auditoria e
    // valida ação; sem ele, abre o BI e olha. É o perfil "Liderança /
    // Visualizador" do pedido, sem precisar de papel novo.
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "produtividade-armazem",
    // Continua existindo para a tela de configuração (catálogos: fábrica/
    // transportadora/produto/embalagem/empilhadeira) e para a liderança
    // que administra a área inteira. Não é mais um módulo opcional
    // liberado por pessoa (ver MODULOS_OPCIONAIS) -- foi trocado pelos
    // sub-módulos abaixo, um por funcionalidade.
    rotulo: "Produtividade do Armazém",
    rotulosDeAcao: {
      // A CONCESSÃO MAIS AMBÍGUA DO APP, e a tela agora diz isso: o mesmo
      // "ver" abre a análise da Gestão E a tela de cadastro no Modo
      // Liderança. Separar os dois muda permissão de verdade -- fica para
      // uma decisão à parte; enquanto isso, ao menos ninguém concede sem
      // saber.
      ver: "📊 Abrir a análise do Armazém e a tela de cadastros",
      criar: "Criar registro nos cadastros do armazém",
      editar: "Cadastrar produto, fábrica, transportadora, empilhadeira, rua",
      excluir: "Corrigir e apagar lançamento de outra pessoa",
    },
    emoji: "🏭",
    href: "/admin/produtividade-armazem",
    grupo: "Configuração",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "pa-reepack",
    rotulosDeAcao: { ver: "Apontar Reepack no app" },
    rotulo: "Reepack",
    emoji: "📦",
    href: "/produtividade-armazem/reepack",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-despejo",
    rotulosDeAcao: { ver: "Apontar Despejo no app" },
    rotulo: "Despejo",
    emoji: "🫗",
    href: "/produtividade-armazem/despejo",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-empilhadeira",
    rotulosDeAcao: {
      // Três coisas de uma vez, e a terceira quase ninguém sabe: é este
      // "ver" que autoriza TRANSPORTAR no Abastecimento do Picking.
      ver: "📊 Operar empilhadeira, transportar no Picking e ver o painel de gás",
    },
    rotulo: "Empilhadeira",
    emoji: "🏗️",
    href: "/produtividade-armazem/empilhadeira",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-recebimento",
    rotulosDeAcao: { ver: "Apontar Recebimento de Paletes no app" },
    rotulo: "Recebimento de Paletes",
    emoji: "🚛",
    href: "/produtividade-armazem/recebimento",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-cinco-s",
    rotulosDeAcao: { ver: "Apontar o 5S do Armazém no app" },
    rotulo: "5S do Armazém",
    emoji: "🧹",
    href: "/produtividade-armazem/cinco-s",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-picking",
    rotulosDeAcao: { ver: "Apontar o Abastecimento do Picking no app" },
    rotulo: "Abastecimento do Picking",
    // 🏬 são as prateleiras -- o picking É a estante de onde o separador
    // tira o produto, e abastecer é enchê-la. O 🛒 anterior saiu a pedido
    // do dono (03/09/2026): carrinho de compras é supermercado, não
    // armazém, e no celular dele o desenho ainda parecia uma caixa de
    // leite. 📦 estava fora de questão -- já é o Ativo de Giro, e o Bate
    // Palete usa 🤲📦.
    emoji: "🏬",
    // O id continua "pa-picking" de propósito: em 29/08/2026 a tela foi
    // trocada pelo Abastecimento (produto e HL no lugar de "posições",
    // campo que ficou vazio em 100% das sessões antigas). Manter o id
    // fez todo mundo que já tinha picking entrar na tela nova sem
    // reconceder acesso pessoa a pessoa -- e evitou um segundo módulo
    // medindo a mesma atividade, o erro do "Recebimento de Paletes".
    href: "/produtividade-armazem/abastecimento",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-bate-palete",
    rotulosDeAcao: { ver: "Apontar Bate Palete no app" },
    rotulo: "Bate Palete",
    emoji: "🤲📦",
    href: "/produtividade-armazem/bate-palete",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  // NÃO existe um módulo "pa-ressuprimento". Existiu por um dia
  // (migration 085) e foi desfeito na 086, a pedido do dono: pedir,
  // transportar e abastecer são etapas da MESMA atividade. Quem pede e
  // quem abastece usam "pa-picking"; quem transporta, "pa-empilhadeira".
  // Uma concessão a mais para a primeira etapa obrigaria a liberar duas
  // coisas para a mesma pessoa fazer um trabalho só.
  {
    id: "carretas-portaria",
    rotulosDeAcao: {
      ver: "Abrir a Portaria no app",
      criar: "Registrar a chegada da carreta",
    },
    // Sem tela de admin propria: os catalogos (fabrica/transportadora/
    // produto) ja sao geridos em /admin/produtividade-armazem.
    rotulo: "Recebimento de Carreta",
    emoji: "👮",
    href: "/carretas-portaria",
    grupo: "Operação",
    acoes: ["ver", "criar"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "carretas-conferencia",
    rotulosDeAcao: {
      ver: "Abrir o Monitor de Recebimento",
      editar: "Conferir carga, responder a blitz e decidir o retorno",
    },
    rotulo: "Monitor de Recebimento (Conferente)",
    emoji: "🖥️",
    href: "/carretas-conferencia",
    grupo: "Operação",
    // "editar" aqui é especificamente conferir carga, finalizar
    // conferência e decidir o retorno (vazia/com AG) -- as ações de
    // descarga (iniciar/finalizar descarga, concluir carga) moraram
    // sempre na mesma tela mas viraram um módulo à parte
    // (carretas-descarga) em 27/08/2026, pedido do dono: conferente e
    // empilhador são funções diferentes, cada uma só mexe na sua etapa.
    acoes: ["ver", "editar"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "carretas-descarga",
    rotulosDeAcao: {
      ver: "Abrir o Monitor de Recebimento",
      editar: "Iniciar e finalizar a descarga, concluir a carga",
    },
    rotulo: "Monitor de Recebimento (Empilhador)",
    emoji: "🏗️",
    href: "/carretas-conferencia",
    grupo: "Operação",
    // Mesma tela do Monitor de Recebimento -- só as ações de descarga
    // (iniciar/finalizar descarga, concluir a carga de retorno) ficam
    // atrás desta permissão, separada da de conferência.
    acoes: ["ver", "editar"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "fefo",
    rotulosDeAcao: {
      ver: "Abrir a Quebra de FEFO no app",
      criar: "Informar uma quebra encontrada",
    },
    rotulo: "Quebra de FEFO (informar)",
    emoji: "🚨",
    href: "/fefo",
    grupo: "Operação",
    // Quem acha a quebra no armazém avisa por aqui. Separado de
    // "fefo-controle" a pedido do dono (27/08/2026): quem aponta não é
    // quem fecha a ocorrência.
    acoes: ["ver", "criar"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "fefo-controle",
    rotulosDeAcao: {
      ver: "Ver as quebras de FEFO de todo mundo",
      editar: "Responder qual ação foi tomada e encerrar",
    },
    rotulo: "Quebra de FEFO (controle)",
    emoji: "🧭",
    href: "/fefo",
    grupo: "Operação",
    // Mesma tela: quem tem isto enxerga as ocorrências de todo mundo e
    // responde qual ação foi tomada.
    acoes: ["ver", "editar"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "perfis-acesso",
    rotulosDeAcao: {
      ver: "Abrir os Perfis de Acesso",
      editar: "Criar perfil e aplicá-lo a alguém",
      excluir: "Apagar o perfil (não tira acesso de ninguém)",
    },
    rotulo: "Perfis de Acesso",
    emoji: "🎫",
    href: "/admin/perfis-de-acesso",
    grupo: "Pessoas",
    // "editar" cria e aplica perfil; "excluir" apaga o perfil (o que
    // NAO tira permissao de ninguem -- as concessoes ja foram gravadas
    // e vivem por conta propria).
    acoes: ["ver", "editar", "excluir"],
  },
  {
    id: "colaboradores",
    rotulosDeAcao: {
      ver: "Abrir a lista de colaboradores",
      criar: "Cadastrar colaborador",
      editar: "Editar cadastro e vincular à revenda",
      excluir: "Apagar colaborador",
      promover: "Tornar alguém liderança",
    },
    rotulo: "Colaboradores",
    emoji: "👥",
    href: "/admin/colaboradores",
    grupo: "Pessoas",
    // "promover" é à parte de propósito: dá para confiar o cadastro a
    // alguém sem confiar a ela o poder de criar novas lideranças.
    acoes: ["ver", "criar", "editar", "excluir", "promover"],
  },
  {
    id: "feedbacks",
    rotulosDeAcao: {
      ver: "📊 Ler os feedbacks das rotas (e usar o app)",
      editar: "Responder a tratativa dos 5 Porquês",
    },
    rotulo: "Feedbacks das Rotas",
    emoji: "📝",
    href: "/gestao/feedbacks",
    grupo: "Gestão de Dados",
    emGestao: true,
    // "editar" = responder a tratativa das análises de 5 Porquês. Quem só
    // tem "ver" acompanha a fila, mas não grava resposta para o motorista.
    acoes: ["ver", "editar"],
  },
  {
    id: "metricas",
    rotulosDeAcao: {
      ver: "📊 Ver quem entra no app, e em quais telas",
    },
    rotulo: "Uso do App",
    emoji: "📊",
    href: "/gestao/uso-do-app",
    grupo: "Gestão de Dados",
    emGestao: true,
    acoes: ["ver"],
  },
  {
    id: "pesquisa",
    rotulosDeAcao: {
      ver: "Abrir a Pesquisa de Satisfação",
      editar: "Ligar/desligar a pesquisa e abrir novo ciclo",
    },
    rotulo: "Pesquisa de Satisfação",
    emoji: "⭐",
    href: "/admin/pesquisa",
    grupo: "Engajamento",
    acoes: ["ver", "editar"],
  },
  {
    id: "menu",
    rotulosDeAcao: {
      ver: "Abrir a Ordem do Menu",
      editar: "Mover, renomear e esconder cartão da tela inicial",
    },
    rotulo: "Ordem do Menu",
    emoji: "🔀",
    href: "/admin/menu",
    grupo: "Configuração",
    acoes: ["ver", "editar"],
  },
];

/**
 * Módulos que ficam escondidos por padrão mesmo com a revenda ligada --
 * cada colaborador só vê depois de liberação individual, em
 * `colaborador_modulos_extra`. Um módulo novo entra aqui e já aparece na
 * tabela de acesso em /admin/acessos sem precisar de outra migration.
 *
 * Generalizado em 24/08/2026 (migration 053): antes só o Ativo de Giro
 * passava por aqui, o resto do "Conteúdo do app" era visível pra
 * qualquer um da revenda sem checagem individual. A migration 053
 * já gravou a concessão de quem tinha acesso ANTES da mudança -- ninguém
 * perdeu nada no dia da virada; dali em diante, restringir é o Admin
 * desmarcando quem não deveria ter.
 *
 * "5s" entrou nesta lista em 26/08/2026, a pedido do dono: antes ficava de
 * fora porque já tinha controle próprio (auditor/dono de área, em
 * cinco_s_*), mas isso só dá acesso RECORTADO por área -- não havia jeito
 * de liberar alguém para ver o módulo inteiro sem também torná-lo auditor
 * ou dono de uma área. Aqui o toggle some ADICIONA essa via de acesso (o
 * "Visualizador" do módulo -- ver getContexto5S em cinco-s-server.ts); não
 * substitui nem migra o cadastro de auditor/dono, que continua vivendo nas
 * abas Auditores/Áreas de /admin/5s porque são vínculos operacionais, não
 * só permissão. Quem já era auditor ou dono de área antes desta mudança
 * não perdeu nada -- os dois caminhos convivem.
 *
 * De propósito FORA desta lista:
 *   colaboradores/metricas/pesquisa/menu -- são telas do Admin, não
 *              conteúdo que um colaborador comum navegue; já protegidas
 *              por `requireModulo`/permissão de liderança.
 *   "produtividade-armazem" -- vira SÓ a tela de configuração de
 *              catálogos (liderança), não é mais um toggle por pessoa.
 *
 * Trocado em 25/08/2026: "produtividade-armazem" saiu daqui e virou seis
 * módulos (pa-reepack, pa-despejo, pa-empilhadeira, pa-recebimento,
 * pa-cinco-s, pa-picking), um por funcionalidade -- pedido do dono, que
 * queria liberar cada uma separadamente em vez de tudo de uma vez. A
 * migration 058 fez o mesmo backfill da 053: todo colaborador que já
 * tinha "produtividade-armazem" ganhou as seis, ninguém perdeu acesso no
 * dia da virada. Portaria/Conferência de Carretas entraram no mesmo
 * grupo visual (`subGrupoDe`) por serem, na prática, mais uma
 * funcionalidade de chão de armazém.
 */
export const MODULOS_OPCIONAIS: ModuloId[] = [
  "ativo-giro",
  "comunicados",
  "ranking",
  "padroes",
  "sonho",
  "rotas",
  "escala",
  "rv",
  "quiz",
  "feedbacks",
  "5s",
  "pa-reepack",
  "pa-despejo",
  "pa-empilhadeira",
  "pa-recebimento",
  "pa-cinco-s",
  "pa-picking",
  "pa-bate-palete",
  "carretas-portaria",
  "carretas-conferencia",
  "carretas-descarga",
  "fefo",
  "fefo-controle",
  "rating",
  "refugo",
  "devolucao",
  "meus-indicadores",
];

/**
 * Os três indicadores pessoais do motorista/ajudante vivem DENTRO de
 * "Meus Indicadores" (pedido do dono, 30/08/2026), do mesmo jeito que as
 * funcionalidades de chão vivem dentro de Produtividade do Armazém.
 *
 * A concessão continua sendo por módulo -- dá para liberar só o Rating
 * para alguém. O que muda é o caminho: em vez de três cartões soltos na
 * tela inicial, um só que leva à vitrine.
 */
export const SUBMODULOS_INDICADORES: ModuloId[] = ["rating", "refugo", "devolucao"];

const MAPA = new Map(MODULOS.map((m) => [m.id, m]));

export function moduloPorId(id: string) {
  return MAPA.get(id as ModuloId);
}

export function ehModuloValido(id: string): id is ModuloId {
  return MAPA.has(id as ModuloId);
}

export function ehAcaoValida(a: string): a is Acao {
  return (
    a === "ver" ||
    a === "criar" ||
    a === "editar" ||
    a === "excluir" ||
    a === "promover"
  );
}

/**
 * Telas que NUNCA podem ser delegadas. Mexer em quem pode o quê é do Admin,
 * e só dele -- é o que impede uma liderança de aumentar o próprio poder.
 *
 * O `grupo` opcional move o item para uma gaveta normal da barra, EM VEZ
 * do bloco dourado "Só do Admin". Ele muda onde a tela aparece, e nada
 * mais: quem não é dono continua sem receber a lista inteira (ver
 * admin/layout.tsx, onde `grupoDono` só existe para o dono). Serve para a
 * tela que é exclusiva por precaução, mas que na cabeça de quem usa é uma
 * configuração como as outras.
 */
export const MODULOS_DO_DONO: {
  href: string;
  rotulo: string;
  emoji: string;
  grupo?: GrupoDoAdmin;
}[] = [
  {
    href: "/admin/revendas",
    rotulo: "Revendas",
    emoji: "🏢",
  },
  {
    // "por Pessoa" é o que separa esta tela de Perfis de Acesso, em
    // Pessoas -- lá se monta um molde, aqui se mexe em gente. O rótulo
    // antigo ("Usuários e Acessos") ainda discordava do título da própria
    // tela ("Gestão de Acessos"): duas telas parecidas e três nomes.
    href: "/admin/acessos",
    rotulo: "Acessos por Pessoa",
    emoji: "🔐",
  },
  {
    href: "/admin/auditoria",
    rotulo: "Log de Auditoria",
    emoji: "📋",
  },
  {
    // Em Configuração, e não no bloco dourado (pedido do dono,
    // 02/09/2026): ligar e desligar aviso por módulo é ajuste de
    // funcionamento, irmão de Metas e do Menu -- não é uma tela de poder
    // como Acessos e Auditoria. Continua exclusiva do dono.
    href: "/admin/notificacoes",
    rotulo: "Notificações",
    emoji: "🔔",
    grupo: "Configuração",
  },
  {
    href: "/admin/creditos-ia",
    rotulo: "Créditos de IA",
    emoji: "💳",
  },
];

export function ehOwner(papel: string | undefined) {
  // "admin" é o papel antigo, de antes deste sistema. Fica aceito como ponte
  // para o caso de o app subir antes da migração rodar -- sem isso o dono
  // ficaria trancado do lado de fora do próprio app. Depois que a migração
  // rodar, ninguém mais terá esse papel e a linha vira letra morta.
  return papel === "owner" || papel === "admin";
}

/** Uma permissão concedida, no formato "modulo:acao". */
export type Concessao = `${ModuloId}:${Acao}`;

export function chaveDaPermissao(modulo: string, acao: string) {
  return `${modulo}:${acao}`;
}

/**
 * A pergunta que todo o sistema faz.
 *
 * O dono passa direto. A liderança só passa com a concessão exata na mão.
 * Colaborador nunca passa -- para ele o Modo Liderança não existe.
 */
export function podeFazer(
  papel: string | undefined,
  concessoes: Set<string>,
  modulo: ModuloId,
  acao: Acao,
) {
  if (ehOwner(papel)) return true;
  if (papel !== "lideranca") return false;
  return concessoes.has(chaveDaPermissao(modulo, acao));
}

/** Tem alguma coisa liberada? É o que decide se o botão Liderança aparece. */
export function temAlgumAcesso(papel: string | undefined, concessoes: Set<string>) {
  if (ehOwner(papel)) return true;
  return papel === "lideranca" && concessoes.size > 0;
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  owner: "Admin",
  lideranca: "Liderança",
  colaborador: "Colaborador",
};

export const ROTULO_ACAO: Record<Acao, string> = {
  ver: "Visualizar",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  promover: "Tornar liderança",
};

/** Explicação das ações que não se explicam sozinhas. */
export const AJUDA_ACAO: Partial<Record<Acao, string>> = {
  promover:
    "Pode promover um colaborador a liderança e desfazer isso — mas NÃO pode definir as permissões de ninguém. Quem ela promover entra sem nenhum módulo liberado, e só o Admin libera.",
};
