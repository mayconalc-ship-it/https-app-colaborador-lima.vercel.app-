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
  | "metas"
  | "fontes-dados"
  | "perfis-acesso";

/**
 * As gavetas do Modo Liderança, na ordem em que aparecem.
 *
 * A ordem não é alfabética: é a do dia de quem administra. Comunicação e
 * Engajamento são o que se publica; Indicadores é o que se acompanha;
 * Operação é o que se configura para o chão de fábrica; Pessoas e
 * Configuração são os menos frequentes e ficam no fim.
 */
export const GRUPOS_DO_ADMIN = [
  "Comunicação",
  "Engajamento",
  "Indicadores",
  "Operação",
  "Pessoas",
  "Configuração",
] as const;

export type GrupoDoAdmin = (typeof GRUPOS_DO_ADMIN)[number];

/** Emoji de cada gaveta, para a barra não ser só uma lista de texto. */
export const EMOJI_GRUPO_ADMIN: Record<GrupoDoAdmin, string> = {
  "Comunicação": "📣",
  "Engajamento": "🎯",
  "Indicadores": "📊",
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
   * lateral do Modo Liderança, mas continua na Gestão de Acessos para ser
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
   * da Gestão de Acessos: mudou o endereço da tela, não a permissão.
   */
  emGestao?: boolean;
};

export const MODULOS: Modulo[] = [
  {
    id: "comunicados",
    rotulo: "Jornal / Comunicados",
    emoji: "📰",
    href: "/admin/comunicados",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "ranking",
    rotulo: "Ranking Super Matinal",
    emoji: "🏆",
    href: "/admin/ranking",
    grupo: "Engajamento",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "padroes",
    rotulo: "Padrões",
    emoji: "📋",
    href: "/admin/padroes",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "sonho",
    rotulo: "Sonho da Revenda",
    emoji: "🎯",
    href: "/admin/sonho-da-revenda",
    grupo: "Comunicação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "rating",
    rotulo: "Rating de Entrega",
    emoji: "⭐",
    href: "/admin/rating",
    grupo: "Indicadores",
    // "criar" = importar os relatórios do Drive. O motorista e o ajudante
    // só veem as PRÓPRIAS avaliações, e para isso basta a concessão do
    // módulo (sem ação) -- quem não entrega não tem o que ver aqui.
    acoes: ["ver", "criar"],
  },
  {
    id: "meus-indicadores",
    rotulo: "Meus Indicadores",
    emoji: "📊",
    // Não tem tela de Admin própria: o que se administra são os três
    // módulos de dentro (Rating, Refugo, Devolução), cada um com a sua.
    // Esta concessão só abre a vitrine.
    href: "/meus-indicadores",
    grupo: "Indicadores",
    acoes: ["ver"],
    semTelaAdmin: true,
  },
  {
    id: "fontes-dados",
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
    id: "metas",
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
    rotulo: "Justificativas",
    emoji: "🗣️",
    href: "/gestao/justificativas",
    grupo: "Indicadores",
    emGestao: true,
    // Só leitura, e de propósito: a explicação é do colaborador. A
    // liderança lê para tratar, não para editar -- um texto que pode ser
    // mexido por quem foi explicado deixa de ser a versão de quem
    // escreveu.
    acoes: ["ver"],
  },
  {
    id: "devolucao",
    rotulo: "Devolução",
    emoji: "↩️",
    href: "/admin/devolucao",
    grupo: "Indicadores",
    // "criar" = importar; "editar" = a meta e a classificação dos motivos.
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "refugo",
    rotulo: "Refugo de Vasilhame",
    emoji: "♻️",
    href: "/admin/refugo",
    grupo: "Indicadores",
    // "criar" = importar o relatório; "editar" = cadastrar o valor dos
    // materiais. O motorista, o ajudante e o conferente só veem o
    // próprio refugo, e para isso basta a concessão do módulo.
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "rotas",
    rotulo: "Minha Rota (pré-rota)",
    emoji: "🚚",
    href: "/admin/rotas",
    grupo: "Operação",
    // "criar" = importar a planilha. O colaborador só consulta, e para
    // isso não precisa de permissão nenhuma.
    acoes: ["ver", "criar", "excluir"],
  },
  {
    id: "escala",
    rotulo: "Escala de Trabalho",
    emoji: "🗓️",
    href: "/admin/escala",
    grupo: "Comunicação",
    acoes: ["ver", "editar"],
  },
  {
    id: "rv",
    rotulo: "Remuneração Variável",
    emoji: "💰",
    href: "/admin/rv",
    grupo: "Indicadores",
    acoes: ["ver", "editar"],
  },
  {
    id: "ativo-giro",
    rotulo: "Ativo de Giro",
    emoji: "📦",
    href: "/admin/ativo-de-giro",
    grupo: "Operação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "quiz",
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
    rotulo: "Programa 5S",
    emoji: "🧹",
    href: "/admin/5s",
    grupo: "Operação",
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
    emoji: "🏭",
    href: "/admin/produtividade-armazem",
    grupo: "Operação",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "pa-reepack",
    rotulo: "Reepack",
    emoji: "📦",
    href: "/produtividade-armazem/reepack",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-despejo",
    rotulo: "Despejo",
    emoji: "🫗",
    href: "/produtividade-armazem/despejo",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-empilhadeira",
    rotulo: "Empilhadeira",
    emoji: "🏗️",
    href: "/produtividade-armazem/empilhadeira",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-recebimento",
    rotulo: "Recebimento de Paletes",
    emoji: "🚛",
    href: "/produtividade-armazem/recebimento",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-cinco-s",
    rotulo: "5S do Armazém",
    emoji: "🧹",
    href: "/produtividade-armazem/cinco-s",
    grupo: "Operação",
    acoes: ["ver"],
    subGrupoDe: "produtividade-armazem",
  },
  {
    id: "pa-picking",
    rotulo: "Abastecimento do Picking",
    emoji: "🛒",
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
    rotulo: "Bate Palete",
    emoji: "🔨",
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
    rotulo: "Feedbacks das Rotas",
    emoji: "📝",
    href: "/gestao/feedbacks",
    grupo: "Indicadores",
    emGestao: true,
    // "editar" = responder a tratativa das análises de 5 Porquês. Quem só
    // tem "ver" acompanha a fila, mas não grava resposta para o motorista.
    acoes: ["ver", "editar"],
  },
  {
    id: "metricas",
    rotulo: "Uso do App",
    emoji: "📊",
    href: "/gestao/uso-do-app",
    grupo: "Indicadores",
    emGestao: true,
    acoes: ["ver"],
  },
  {
    id: "pesquisa",
    rotulo: "Pesquisa de Satisfação",
    emoji: "⭐",
    href: "/admin/pesquisa",
    grupo: "Engajamento",
    acoes: ["ver", "editar"],
  },
  {
    id: "menu",
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
 */
export const MODULOS_DO_DONO = [
  {
    href: "/admin/revendas",
    rotulo: "Revendas",
    emoji: "🏢",
  },
  {
    href: "/admin/acessos",
    rotulo: "Usuários e Acessos",
    emoji: "🔐",
  },
  {
    href: "/admin/auditoria",
    rotulo: "Log de Auditoria",
    emoji: "📋",
  },
  {
    href: "/admin/notificacoes",
    rotulo: "Notificações",
    emoji: "🔔",
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
