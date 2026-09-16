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
  | "feedback-tratativa"
  | "rotas"
  | "ativo-giro"
  | "quiz"
  | "cinco-porques"
  // A análise que ficou pela metade (14/09/2026). Módulo próprio, e não
  // "cinco-porques", porque o botão do sino sai do módulo: lá ele diz "Ver
  // resposta" (a devolutiva da liderança), aqui a tarefa é continuar.
  | "cinco-porques-pendente"
  // A análise concluída esperando a devolutiva da LIDERANÇA (14/09/2026).
  // Próprio pelo mesmo motivo: o aviso é para quem responde, não para o
  // motorista, e o botão é "Responder agora".
  | "cinco-porques-tratativa"
  | "5s"
  | "produtividade-armazem"
  // A bombona do despejo enchendo (14/09/2026). Próprio pelo mesmo motivo:
  // o botão de "produtividade-armazem" diz "Abrir empilhadeira".
  | "despejo"
  | "relato-anomalia"
  | "meus-indicadores"
  // Boas Práticas (15/09/2026): votação aberta, vencedora e a resposta da
  // liderança para quem sugeriu.
  | "boas-praticas"
  // A sugestão nova esperando a LIDERANÇA avaliar. Próprio pelo mesmo
  // motivo do "cinco-porques-tratativa": o aviso e o botão são de quem
  // avalia, não de quem sugeriu.
  | "boas-praticas-avaliar"
  // Material de apoio chegando na política mínima (16/09/2026): o aviso é
  // para quem compra, com a quantidade sugerida.
  | "material-apoio"
  // O lembrete diário de CONTAR o material de apoio (16/09/2026). Próprio
  // porque o botão é outro ("Contar agora") e quem recebe é quem conta, não
  // quem compra.
  | "material-apoio-contagem"
  // O resumo de segunda-feira para a liderança (16/09/2026): ranking,
  // metas e pendências da semana que fechou.
  | "resumo-semanal";

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
  "feedback-tratativa",
  "rotas",
  "ativo-giro",
  "quiz",
  "cinco-porques",
  "cinco-porques-pendente",
  "cinco-porques-tratativa",
  "5s",
  "produtividade-armazem",
  "despejo",
  "relato-anomalia",
  "meus-indicadores",
  "boas-praticas",
  "boas-praticas-avaliar",
  "material-apoio",
  "material-apoio-contagem",
  "resumo-semanal",
];

export const EMOJI_MODULO: Record<ModuloNotificavel, string> = {
  comunicados: "📰",
  padroes: "📚",
  ranking: "🏆",
  sonho: "🎯",
  escala: "🗓️",
  rv: "💰",
  feedback: "📝",
  "feedback-tratativa": "📝",
  rotas: "🚚",
  "ativo-giro": "🔁",
  quiz: "🏆",
  "cinco-porques": "🧠",
  "cinco-porques-pendente": "🧠",
  "cinco-porques-tratativa": "🧠",
  "5s": "🧹",
  "produtividade-armazem": "🏭",
  despejo: "🪣",
  "relato-anomalia": "🚨",
  "meus-indicadores": "📊",
  "boas-praticas": "💡",
  "boas-praticas-avaliar": "💡",
  "material-apoio": "🧰",
  "material-apoio-contagem": "🧰",
  "resumo-semanal": "🗓️",
};

export const ROTULO_MODULO: Record<ModuloNotificavel, string> = {
  comunicados: "Jornal",
  padroes: "Padrões",
  ranking: "Ranking",
  sonho: "Sonho da Revenda",
  escala: "Escala de Trabalho",
  rv: "Remuneração Variável",
  feedback: "Feedback da Rota",
  "feedback-tratativa": "Feedback da Rota",
  rotas: "Minha Rota",
  "ativo-giro": "Ativo de Giro",
  quiz: "Desafio do Mês",
  "cinco-porques": "5 Porquês",
  "cinco-porques-pendente": "5 Porquês pela metade",
  "cinco-porques-tratativa": "5 Porquês para responder",
  "5s": "Programa 5S",
  "produtividade-armazem": "Produtividade do Armazém",
  despejo: "Bombona do despejo",
  "relato-anomalia": "Relato de Anomalia",
  "meus-indicadores": "Meus Indicadores",
  "boas-praticas": "Boas Práticas",
  "boas-praticas-avaliar": "Boas Práticas para avaliar",
  "material-apoio": "Material de Apoio",
  "material-apoio-contagem": "Contagem diária do material de apoio",
  "resumo-semanal": "Resumo semanal da liderança",
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
  "feedback-tratativa": "Ver resposta",
  rotas: "Ver minha rota",
  "ativo-giro": "Recontar agora",
  quiz: "Participar",
  "cinco-porques": "Ver resposta",
  "cinco-porques-pendente": "Continuar análise",
  "cinco-porques-tratativa": "Responder agora",
  "5s": "Abrir o 5S",
  "produtividade-armazem": "Abrir empilhadeira",
  despejo: "Ver a bombona",
  // "Registrar o relato", e não "Ver": o aviso do gatilho não é
  // informação -- é uma tarefa com dono, e o botão diz o que fazer.
  "relato-anomalia": "Registrar o relato",
  "meus-indicadores": "Ver meus indicadores",
  "boas-praticas": "Ver Boas Práticas",
  "boas-praticas-avaliar": "Avaliar agora",
  "material-apoio": "Ver o estoque",
  "material-apoio-contagem": "Contar agora",
  "resumo-semanal": "Ver o resumo",
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
