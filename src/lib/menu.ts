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
};

export type ItemMenu = {
  chave: string;
  titulo: string;
  emoji: string;
  href: string;
  ordem: number;
  visivel: boolean;
};

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
  { chave: "rating", titulo: "Meu Rating", emoji: "⭐", href: "/rating", ordem: 14, visivel: true },
  { chave: "refugo", titulo: "Meu Refugo", emoji: "♻️", href: "/refugo", ordem: 15, visivel: true },
  { chave: "devolucao", titulo: "Minha Devolução", emoji: "↩️", href: "/devolucao", ordem: 16, visivel: true },
  // "Minha Conta" fica oculto: já existe o botão "Conta" no topo de todas as
  // telas, e repetir ocupava espaço da grade sem acrescentar nada.
  { chave: "conta", titulo: "Minha Conta", emoji: "🔒", href: "/minha-conta", ordem: 9, visivel: false },
];
