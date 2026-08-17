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
  | "quiz";

export type Modulo = {
  id: ModuloId;
  rotulo: string;
  emoji: string;
  href: string;
  grupo: "Conteúdo do app" | "Pessoas e configuração";
  /** Só as ações que fazem sentido neste módulo. */
  acoes: Acao[];
};

export const MODULOS: Modulo[] = [
  {
    id: "comunicados",
    rotulo: "Jornal / Comunicados",
    emoji: "📰",
    href: "/admin/comunicados",
    grupo: "Conteúdo do app",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "ranking",
    rotulo: "Ranking Super Matinal",
    emoji: "🏆",
    href: "/admin/ranking",
    grupo: "Conteúdo do app",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "padroes",
    rotulo: "Padrões",
    emoji: "📋",
    href: "/admin/padroes",
    grupo: "Conteúdo do app",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "sonho",
    rotulo: "Sonho da Revenda",
    emoji: "🎯",
    href: "/admin/sonho-da-revenda",
    grupo: "Conteúdo do app",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "rotas",
    rotulo: "Minha Rota (pré-rota)",
    emoji: "🚚",
    href: "/admin/rotas",
    grupo: "Conteúdo do app",
    // "criar" = importar a planilha. O colaborador só consulta, e para
    // isso não precisa de permissão nenhuma.
    acoes: ["ver", "criar", "excluir"],
  },
  {
    id: "escala",
    rotulo: "Escala de Trabalho",
    emoji: "🗓️",
    href: "/admin/escala",
    grupo: "Conteúdo do app",
    acoes: ["ver", "editar"],
  },
  {
    id: "rv",
    rotulo: "Remuneração Variável",
    emoji: "💰",
    href: "/admin/rv",
    grupo: "Conteúdo do app",
    acoes: ["ver", "editar"],
  },
  {
    id: "ativo-giro",
    rotulo: "Ativo de Giro",
    emoji: "📦",
    href: "/admin/ativo-de-giro",
    grupo: "Conteúdo do app",
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
    grupo: "Conteúdo do app",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "colaboradores",
    rotulo: "Colaboradores",
    emoji: "👥",
    href: "/admin/colaboradores",
    grupo: "Pessoas e configuração",
    // "promover" é à parte de propósito: dá para confiar o cadastro a
    // alguém sem confiar a ela o poder de criar novas lideranças.
    acoes: ["ver", "criar", "editar", "excluir", "promover"],
  },
  {
    id: "feedbacks",
    rotulo: "Feedbacks das Rotas",
    emoji: "📝",
    href: "/admin/feedbacks",
    grupo: "Pessoas e configuração",
    // "editar" = responder a tratativa das análises de 5 Porquês. Quem só
    // tem "ver" acompanha a fila, mas não grava resposta para o motorista.
    acoes: ["ver", "editar"],
  },
  {
    id: "metricas",
    rotulo: "Uso do App",
    emoji: "📊",
    href: "/admin/metricas",
    grupo: "Pessoas e configuração",
    acoes: ["ver"],
  },
  {
    id: "pesquisa",
    rotulo: "Pesquisa de Satisfação",
    emoji: "⭐",
    href: "/admin/pesquisa",
    grupo: "Pessoas e configuração",
    acoes: ["ver", "editar"],
  },
  {
    id: "menu",
    rotulo: "Ordem do Menu",
    emoji: "🔀",
    href: "/admin/menu",
    grupo: "Pessoas e configuração",
    acoes: ["ver", "editar"],
  },
];

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
    rotulo: "Gestão de Acessos",
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
