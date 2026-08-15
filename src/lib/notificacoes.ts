/**
 * Vocabulário da central de notificações.
 *
 * Fica separado do servidor de propósito: a tela do colaborador importa
 * daqui sem arrastar junto a chave de administrador.
 */

export type TipoNotificacao =
  | "novo"
  | "atualizado"
  | "pendencia"
  | "lembrete"
  | "importante";

/** Módulos que podem gerar aviso. Acrescentar aqui basta para o futuro. */
export type ModuloNotificavel =
  | "comunicados"
  | "padroes"
  | "ranking"
  | "sonho"
  | "escala"
  | "rv"
  | "feedback"
  | "rotas"
  | "ativo-giro"
  | "quiz"
  | "cinco-porques";

/**
 * A mesma lista, em forma de array.
 *
 * Serve para gravar a configuração de uma revenda que ainda não tem linha
 * nenhuma: sem ela, só dava para atualizar o que já existia no banco.
 */
export const MODULOS_NOTIFICAVEIS: ModuloNotificavel[] = [
  "comunicados",
  "padroes",
  "ranking",
  "sonho",
  "escala",
  "rv",
  "feedback",
  "rotas",
  "ativo-giro",
  "quiz",
  "cinco-porques",
];

export const EMOJI_MODULO: Record<ModuloNotificavel, string> = {
  comunicados: "📰",
  padroes: "📚",
  ranking: "🏆",
  sonho: "🎯",
  escala: "🗓️",
  rv: "💰",
  feedback: "📝",
  rotas: "🚚",
  "ativo-giro": "🔁",
  quiz: "🏆",
  "cinco-porques": "🧠",
};

export const ROTULO_MODULO: Record<ModuloNotificavel, string> = {
  comunicados: "Jornal",
  padroes: "Padrões",
  ranking: "Ranking",
  sonho: "Sonho da Revenda",
  escala: "Escala de Trabalho",
  rv: "Remuneração Variável",
  feedback: "Feedback da Rota",
  rotas: "Minha Rota",
  "ativo-giro": "Ativo de Giro",
  quiz: "Desafio do Mês",
  "cinco-porques": "5 Porquês",
};

/**
 * Prioridade decide quem aparece primeiro quando há várias.
 * Pendência ganha de novidade: deixar de fazer custa mais do que deixar
 * de ler.
 */
export const PRIORIDADE: Record<TipoNotificacao, number> = {
  pendencia: 90,
  importante: 70,
  lembrete: 50,
  atualizado: 30,
  novo: 20,
};

export type Aviso = {
  /** "n:42" para publicada, "feedback:2026-08-01" para pendência. */
  chave: string;
  tipo: TipoNotificacao;
  modulo: ModuloNotificavel;
  titulo: string;
  mensagem: string;
  url: string;
  rotuloBotao: string;
  prioridade: number;
  criadoEm: string;
  /** Já foi aberto alguma vez? Define a bolinha azul no sino. */
  vista: boolean;
};

/** Texto do botão por módulo — "Ver" genérico não convida ninguém. */
export const ROTULO_BOTAO: Record<ModuloNotificavel, string> = {
  comunicados: "Ver notícia",
  padroes: "Ver padrão",
  ranking: "Ver ranking",
  sonho: "Ver o sonho",
  escala: "Ver escala",
  rv: "Conferir minha RV",
  feedback: "Responder agora",
  rotas: "Ver minha rota",
  "ativo-giro": "Recontar agora",
  quiz: "Participar",
  "cinco-porques": "Ver resposta",
};

/** "há 2 min", "há 3 h", "ontem" — mais legível que data completa. */
export function tempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;

  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}
