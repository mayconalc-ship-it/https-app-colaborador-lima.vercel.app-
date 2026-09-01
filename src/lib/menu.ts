import type { ModuloId } from "@/lib/acessos";

/**
 * De qual módulo cada cartão do menu depende.
 *
 * É o que faz a revenda que não usa RV não mostrar o cartão "Minha RV" para
 * os colaboradores dela. Chave sem módulo aqui (Minha Conta) aparece sempre:
 * não pertence a módulo nenhum.
 */
export const MODULO_DO_ITEM: Record<string, ModuloId> = {
  sonho: "sonho",
  padroes: "padroes",
  ranking: "ranking",
  comunicados: "comunicados",
  escala: "escala",
  rv: "rv",
  rota: "rotas",
  feedback: "feedbacks",
  "ativo-giro": "ativo-giro",
  quiz: "quiz",
  "5s": "5s",
  "produtividade-armazem": "produtividade-armazem",
  "carretas-portaria": "carretas-portaria",
  "carretas-conferencia": "carretas-conferencia",
  rating: "rating",
  refugo: "refugo",
  devolucao: "devolucao",
  "meus-indicadores": "meus-indicadores",
};

export type ItemMenu = {
  chave: string;
  titulo: string;
  emoji: string;
  href: string;
  ordem: number;
  visivel: boolean;
};

/**
 * OS BLOCOS DA TELA INICIAL
 *
 * A home era uma grade plana de até 13 cartões: "Minha RV" (consulta),
 * "Feedback da Rota" (registro), "Desafio do Mês" (engajamento) e
 * "Produtividade do Armazém" (que abre outro submenu) tinham exatamente o
 * mesmo peso. A pessoa procurava por varredura, não por lógica.
 *
 * Os quatro blocos abaixo respondem a perguntas diferentes, e é essa a
 * ordem em que elas aparecem no dia:
 *
 *   1. o que eu consulto sobre mim
 *   2. o que eu executo e registro
 *   3. o que a empresa me comunica
 *   4. o que me engaja
 *
 * Item cuja chave não está em bloco nenhum cai em "Minha Rotina" -- é o
 * que garante que um item novo criado no banco apareça em algum lugar em
 * vez de sumir da tela.
 */
export const BLOCOS_DO_MENU = [
  {
    id: "rotina",
    titulo: "Minha rotina",
    subtitulo: "Seus números e sua programação",
    chaves: ["rv", "meus-indicadores", "escala", "rota"],
  },
  {
    id: "operacao",
    titulo: "Minha operação",
    subtitulo: "O que você executa e registra",
    chaves: ["produtividade-armazem", "feedback", "ativo-giro"],
  },
  {
    id: "empresa",
    titulo: "Da empresa",
    subtitulo: "Comunicados, padrões e metas da revenda",
    chaves: ["comunicados", "padroes", "sonho", "5s"],
  },
  {
    id: "engajamento",
    titulo: "Engajamento",
    subtitulo: "Desafio e ranking",
    chaves: ["quiz", "ranking"],
  },
] as const;

export type BlocoDoMenu = (typeof BLOCOS_DO_MENU)[number];

/**
 * Os itens que ganham cartão GRANDE, ocupando a linha inteira.
 *
 * Não é gosto: é o que os dados de uso dizem. Em 60 dias, `/rv` teve
 * 1.762 aberturas de 53 pessoas -- o módulo mais aberto do app depois da
 * própria home -- e `/produtividade-armazem` teve 1.165 de 41. Esses dois
 * são o motivo de muita gente abrir o app; tratá-los como mais um cartão
 * de 1/2 de largura era desperdiçar a tela onde o dedo já vai.
 */
export const DESTAQUES_DO_MENU = new Set(["rv", "produtividade-armazem"]);

/**
 * Distribui os itens visíveis nos blocos, preservando a ordem do banco.
 *
 * Com UMA exceção: o destaque vai para o topo do bloco dele. O cartão de
 * destaque ocupa a linha inteira, então no meio da grade ele quebra o
 * fluxo de duas colunas e deixa um buraco ao lado do vizinho de cima --
 * foi o que aconteceu com a Escala, que ficava sozinha porque a RV vinha
 * logo depois. No topo ele funciona como cabeçalho do bloco, que é o
 * papel que os números de uso dizem que ele tem.
 */
export function agruparItens<T extends { chave: string }>(itens: T[]) {
  const usadas = new Set<string>();
  const blocos = BLOCOS_DO_MENU.map((b) => {
    const doBloco = itens.filter((i) => (b.chaves as readonly string[]).includes(i.chave));
    for (const i of doBloco) usadas.add(i.chave);
    const destaques = doBloco.filter((i) => DESTAQUES_DO_MENU.has(i.chave));
    const resto = doBloco.filter((i) => !DESTAQUES_DO_MENU.has(i.chave));
    return { ...b, itens: [...destaques, ...resto] };
  });

  // Item sem bloco entra no primeiro, em vez de desaparecer.
  const sobrando = itens.filter((i) => !usadas.has(i.chave));
  if (sobrando.length > 0) blocos[0].itens = [...blocos[0].itens, ...sobrando];

  return blocos.filter((b) => b.itens.length > 0);
}

// Usado enquanto a tabela menu_itens nao estiver populada.
export const MENU_PADRAO: ItemMenu[] = [
  { chave: "sonho", titulo: "Sonho da Revenda", emoji: "🎯", href: "/sonho-da-revenda", ordem: 1, visivel: true },
  { chave: "padroes", titulo: "Padrões", emoji: "📋", href: "/padroes", ordem: 2, visivel: true },
  { chave: "ranking", titulo: "Ranking Super Matinal", emoji: "🏆", href: "/ranking", ordem: 3, visivel: true },
  { chave: "comunicados", titulo: "Comunicados", emoji: "📣", href: "/comunicados", ordem: 4, visivel: true },
  { chave: "escala", titulo: "Escala de Trabalho", emoji: "🗓️", href: "/escala", ordem: 5, visivel: true },
  { chave: "rv", titulo: "Minha RV", emoji: "💰", href: "/rv", ordem: 6, visivel: true },
  { chave: "rota", titulo: "Minha Rota", emoji: "🚚", href: "/minha-rota", ordem: 7, visivel: true },
  { chave: "feedback", titulo: "Feedback da Rota", emoji: "📝", href: "/feedback-rota", ordem: 8, visivel: true },
  // Módulo opcional: só aparece pra quem o Admin liberou (ver temAcessoModulo).
  { chave: "ativo-giro", titulo: "Ativo de Giro", emoji: "📦", href: "/ativo-de-giro", ordem: 10, visivel: true },
  { chave: "quiz", titulo: "Desafio do Mês", emoji: "🏆", href: "/desafio", ordem: 11, visivel: true },
  // O cartão aparece para todo mundo, mas a tela só abre para quem é
  // auditor, dono de área ou gestor do 5S -- quem não é vê o convite a
  // procurar o Admin, igual aos demais módulos de acesso restrito.
  { chave: "5s", titulo: "Programa 5S", emoji: "🧹", href: "/5s", ordem: 12, visivel: true },
  { chave: "produtividade-armazem", titulo: "Produtividade do Armazém", emoji: "🏭", href: "/produtividade-armazem", ordem: 13, visivel: true },
  // Módulo opcional: o motorista e o ajudante veem as PRÓPRIAS avaliações.
  // Sem a linha em MODULO_DO_ITEM acima, este cartão apareceria para todo
  // mundo e levaria a uma tela de "sem acesso".
  // Rating, Refugo e Devolução saíram da tela inicial em 30/08/2026: são
  // submódulos de Meus Indicadores agora. As rotas continuam de pé e
  // acessíveis, só não têm mais cartão próprio -- três cartões seguidos
  // para o mesmo assunto disputavam espaço sem ajudar ninguém a decidir.
  { chave: "meus-indicadores", titulo: "Meus Indicadores", emoji: "📊", href: "/meus-indicadores", ordem: 14, visivel: true },
  // "Minha Conta" fica oculto: já existe o botão "Conta" no topo de todas as
  // telas, e repetir ocupava espaço da grade sem acrescentar nada.
  { chave: "conta", titulo: "Minha Conta", emoji: "🔒", href: "/minha-conta", ordem: 9, visivel: false },
];
