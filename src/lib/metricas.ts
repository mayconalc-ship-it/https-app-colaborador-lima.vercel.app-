/**
 * Nomes das telas como o time as conhece, não como o endereço as chama.
 *
 * Módulo novo no menu pede entrada nova aqui. Sem ela o painel de Uso do App
 * mostra o endereço cru ("abriu /5s") -- e quem lê o feed é justamente quem
 * não pensa em rota, pensa em tela. Os nomes e emojis são os mesmos do menu
 * inicial de propósito: o feed tem de falar a língua da tela inicial.
 */
const NOMES: { prefixo: string; nome: string; emoji: string }[] = [
  { prefixo: "/comunicados", nome: "Jornal do Colaborador", emoji: "📰" },
  { prefixo: "/sonho-da-revenda", nome: "Sonho da Revenda", emoji: "🎯" },
  { prefixo: "/ranking", nome: "Ranking Super Matinal", emoji: "🏆" },
  { prefixo: "/padroes", nome: "Padrões", emoji: "📋" },
  { prefixo: "/escala", nome: "Escala de Trabalho", emoji: "🗓️" },
  { prefixo: "/rv", nome: "Minha Remuneração", emoji: "💰" },
  { prefixo: "/feedback-rota", nome: "Feedback da Rota", emoji: "📝" },
  { prefixo: "/5s", nome: "Programa 5S", emoji: "🧹" },
  { prefixo: "/desafio", nome: "Desafio do Mês", emoji: "🧠" },
  { prefixo: "/ativo-de-giro", nome: "Ativo de Giro", emoji: "📦" },
  { prefixo: "/minha-rota", nome: "Minha Rota", emoji: "🚚" },
  { prefixo: "/minha-conta", nome: "Minha Conta", emoji: "👤" },
  { prefixo: "/escolher-revenda", nome: "Troca de revenda", emoji: "🏢" },
  { prefixo: "/definir-senha", nome: "Trocar senha", emoji: "🔑" },
  // Antes de "/admin", que é prefixo mais curto e engoliria estes três se
  // viesse primeiro -- a busca é pela PRIMEIRA entrada que casa.
  { prefixo: "/gestao/armazem", nome: "Produtividade do Armazém", emoji: "🏭" },
  { prefixo: "/gestao/feedbacks", nome: "Feedbacks das Rotas", emoji: "📝" },
  { prefixo: "/gestao/justificativas", nome: "Justificativas", emoji: "🗣️" },
  { prefixo: "/gestao/uso-do-app", nome: "Uso do App", emoji: "📱" },
  { prefixo: "/gestao", nome: "Painel de Gestão", emoji: "📊" },
  { prefixo: "/admin", nome: "Área de gestão", emoji: "⚙️" },
];

export function nomeDaTela(caminho: string) {
  if (caminho === "/") return { nome: "Menu inicial", emoji: "🏠" };
  const achado = NOMES.find((n) => caminho.startsWith(n.prefixo));
  return achado
    ? { nome: achado.nome, emoji: achado.emoji }
    : { nome: caminho, emoji: "📄" };
}

/**
 * "2h 15min", "1min 20s", "45s".
 *
 * Os segundos aparecem junto dos minutos de proposito: arredondando so para
 * minutos, 1min20s virava "1min" e dava a impressao de que o app parou de
 * contar depois do primeiro minuto.
 */
export function formatarDuracao(segundos: number) {
  const total = Math.round(segundos);
  if (total < 60) return `${total}s`;

  if (total < 3600) {
    const min = Math.floor(total / 60);
    const seg = total % 60;
    return seg ? `${min}min ${seg}s` : `${min}min`;
  }

  const horas = Math.floor(total / 3600);
  const min = Math.round((total % 3600) / 60);
  return min ? `${horas}h ${min}min` : `${horas}h`;
}

/** Transforma um evento cru numa frase que se lê de bate-pronto. */
export function descreverEvento(tipo: string, alvo: string) {
  if (tipo === "login") return { emoji: "🔓", frase: "entrou no app" };
  if (tipo === "acao") return { emoji: "👆", frase: alvo };

  const { nome, emoji } = nomeDaTela(alvo);
  return { emoji, frase: `abriu ${nome}` };
}

export function formatarDiaCurto(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}
