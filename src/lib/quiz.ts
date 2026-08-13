/**
 * Vocabulário do Desafio do Mês.
 *
 * Só domínio: nenhuma consulta e nenhum segredo. A tela do colaborador
 * importa daqui sem arrastar junto a chave de administrador — quem lê o
 * banco é o quiz-server.ts.
 */

import { normalizarTexto } from "@/lib/formatar";
import type { AreaId } from "@/lib/areas";

/** Cada pergunta vale isto. Dez perguntas = 100 pontos, e é só. */
export const PONTOS_POR_QUESTAO = 10;

/** Quantas perguntas uma rodada tem, quando ninguém disser o contrário. */
export const PERGUNTAS_PADRAO = 10;

/** G4 + 4 logo abaixo. O Admin muda em /admin/quiz. */
export const POSICOES_PADRAO = 8;

export type TipoQuestao = "multipla" | "vf" | "situacao" | "procedimento";

export const TIPOS_QUESTAO: { id: TipoQuestao; rotulo: string; ajuda: string }[] =
  [
    {
      id: "multipla",
      rotulo: "Múltipla escolha",
      ajuda: "Quatro alternativas, uma correta.",
    },
    {
      id: "vf",
      rotulo: "Verdadeiro ou falso",
      ajuda: "Uma afirmação e duas alternativas.",
    },
    {
      id: "situacao",
      rotulo: "Situação prática",
      ajuda: "Descreve um caso do dia a dia e pergunta o que fazer.",
    },
    {
      id: "procedimento",
      rotulo: "Procedimento correto",
      ajuda: "Qual é a ordem/o passo certo segundo o padrão.",
    },
  ];

export function rotuloTipo(tipo: string) {
  return TIPOS_QUESTAO.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export type Dificuldade = "facil" | "media" | "dificil";

export const DIFICULDADES: { id: Dificuldade; rotulo: string; cor: string }[] = [
  { id: "facil", rotulo: "Fácil", cor: "bg-emerald-100 text-emerald-700" },
  { id: "media", rotulo: "Média", cor: "bg-amber-100 text-amber-700" },
  { id: "dificil", rotulo: "Difícil", cor: "bg-rose-100 text-rose-700" },
];

export function rotuloDificuldade(d: string) {
  return DIFICULDADES.find((x) => x.id === d)?.rotulo ?? d;
}

export function corDificuldade(d: string) {
  return DIFICULDADES.find((x) => x.id === d)?.cor ?? "bg-slate-100 text-slate-600";
}

export type StatusRodada = "rascunho" | "publicada" | "encerrada";

export const ROTULO_STATUS: Record<StatusRodada, string> = {
  rascunho: "Rascunho",
  publicada: "No ar",
  encerrada: "Encerrada",
};

/**
 * A área do colaborador, a partir do que já está no cadastro.
 *
 * `profiles.area` é texto livre digitado no cadastro, e hoje traz
 * "DISTRIBUIÇÃO URBANA" e "APOIO LOGISTICO". Em vez de criar um vínculo
 * novo (e obrigar a recadastrar 60 pessoas), traduzimos esse texto para
 * os mesmos DU/AL que a Escala e a RV já usam.
 *
 * Quem não se encaixa em nenhum dos dois — "GENTE", cadastro pela metade —
 * fica de fora do campeonato em vez de entrar na área errada. A tela diz
 * isso com todas as letras e manda falar com o Admin.
 */
export function areaDoColaborador(area: string | null | undefined): AreaId | null {
  const texto = normalizarTexto(area ?? "");
  if (!texto) return null;

  if (texto.includes("distribui") || texto === "du") return "DU";
  if (
    texto.includes("armazem") ||
    texto.includes("apoio") ||
    texto.includes("logistic") ||
    texto === "al"
  ) {
    return "AL";
  }

  return null;
}

/**
 * O pilar que combina com a área — só como sugestão na hora de criar a
 * rodada. O Admin troca à vontade: a associação real é a que ele escolher.
 */
export function pilarSugerido(area: AreaId) {
  return area === "AL" ? "Armazém" : "Entrega";
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function nomeDoMes(mes: number) {
  return MESES[mes - 1] ?? "";
}

/** "Ago" — cabeçalho das colunas na tabela acumulada. */
export function mesCurto(mes: number) {
  return (MESES[mes - 1] ?? "").slice(0, 3);
}

export type LinhaClassificacao = {
  colaboradorId: string;
  nome: string;
  pontos: number;
  acertos: number;
  /** Quantas rodadas a pessoa jogou. Na rodada única é sempre 1. */
  jogos: number;
  totalPerguntas: number;
  tempoMs: number;
  concluidaEm: string | null;
  posicao: number;
  /** Posição na rodada anterior. Null quando não jogou antes. */
  posicaoAnterior?: number | null;
};

/**
 * A ordem oficial do campeonato:
 *   1) mais pontos
 *   2) mais acertos
 *   3) menos tempo total
 *   4) quem concluiu primeiro
 *
 * O tempo entra só aqui. Ele nunca vira ponto — é o que impede o desafio
 * de virar corrida de clique, respondendo no chute para terminar antes.
 */
export function ordenarClassificacao<
  T extends Omit<LinhaClassificacao, "posicao">,
>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.acertos !== a.acertos) return b.acertos - a.acertos;
    if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs;
    return (a.concluidaEm ?? "").localeCompare(b.concluidaEm ?? "");
  });
}

/** Numera do 1º em diante, já na ordem de `ordenarClassificacao`. */
export function comPosicao<T extends Omit<LinhaClassificacao, "posicao">>(
  linhas: T[],
): (T & { posicao: number })[] {
  return ordenarClassificacao(linhas).map((l, i) => ({ ...l, posicao: i + 1 }));
}

export function medalha(posicao: number) {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return null;
}

export function aproveitamento(acertos: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((acertos / total) * 100);
}

/** "4min 12s" — o tempo aparece como informação, nunca como placar. */
export function formatarTempo(ms: number) {
  const segundos = Math.max(0, Math.round(ms / 1000));
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  if (minutos === 0) return `${resto}s`;
  return `${minutos}min ${String(resto).padStart(2, "0")}s`;
}

/** "01/08 a 31/08" — o período da rodada em uma linha. */
export function periodoCurto(inicio: string, fim: string) {
  const dia = (iso: string) => {
    const [, mes, d] = iso.split("-");
    return `${d}/${mes}`;
  };
  return `${dia(inicio)} a ${dia(fim)}`;
}

/**
 * Quantos dias faltam para a rodada fechar. 0 = último dia, negativo = já
 * fechou. As duas datas viram UTC antes da conta: comparar "AAAA-MM-DD"
 * como data local faria a virada acontecer na hora errada na Vercel, que
 * roda em UTC.
 */
export function diasRestantes(fim: string, hoje: string) {
  const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  return Math.round((dia(fim) - dia(hoje)) / 86400000);
}

// ---------------------------------------------------------------------
// Embaralhamento
// ---------------------------------------------------------------------
// As alternativas não podem sair sempre na mesma ordem — senão a resposta
// certa vira posição decorada. Mas também não podem trocar de lugar a cada
// recarga da página: a pessoa leria uma lista diferente da que estava
// lendo, e o [A] que ela ia marcar vira outra coisa.
//
// A saída é um sorteio COM SEMENTE: a mesma participação e a mesma questão
// sempre produzem a mesma ordem, e duas pessoas na mesma questão recebem
// ordens diferentes.

function semente(texto: string) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sorteador(valor: number) {
  let a = valor;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates com semente. Mesma chave, mesma ordem, sempre. */
export function embaralharCom<T>(itens: T[], chave: string): T[] {
  const proximo = sorteador(semente(chave));
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(proximo() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** A letra que aparece na tela: A, B, C, D. */
export function letra(indice: number) {
  return String.fromCharCode(65 + indice);
}

// ---------------------------------------------------------------------
// Conquistas
// ---------------------------------------------------------------------
// O código é o que fica no banco; o rótulo e o emoji moram aqui porque é
// aqui que vão mudar. Acrescentar um selo novo é acrescentar uma linha.

export type CodigoConquista =
  | "campeao"
  | "top3"
  | "top5"
  | "gabarito"
  | "sequencia3"
  | "especialista";

export const CONQUISTAS: Record<
  CodigoConquista,
  { emoji: string; rotulo: string; descricao: string }
> = {
  campeao: {
    emoji: "🏆",
    rotulo: "Campeão do mês",
    descricao: "Terminou a rodada em 1º lugar.",
  },
  top3: {
    emoji: "🥇",
    rotulo: "Top 3",
    descricao: "Ficou entre os três primeiros da rodada.",
  },
  top5: {
    emoji: "⭐",
    rotulo: "Top 5",
    descricao: "Ficou entre os cinco primeiros da rodada.",
  },
  gabarito: {
    emoji: "🎯",
    rotulo: "100% de acertos",
    descricao: "Acertou todas as perguntas da rodada.",
  },
  sequencia3: {
    emoji: "🔥",
    rotulo: "3 meses seguidos",
    descricao: "Participou de três rodadas seguidas.",
  },
  especialista: {
    emoji: "🧠",
    rotulo: "Especialista no padrão",
    descricao: "Fez 90% ou mais numa rodada deste padrão.",
  },
};

export function conquista(codigo: string) {
  return CONQUISTAS[codigo as CodigoConquista] ?? null;
}
