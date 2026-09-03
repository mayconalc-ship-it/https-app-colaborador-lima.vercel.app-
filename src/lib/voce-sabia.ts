/**
 * "VOCÊ SABIA?" -- a regra de qual pergunta vira card, e quando.
 *
 * Só domínio: nenhuma consulta e nenhum segredo. Quem lê o banco é o
 * voce-sabia-server.ts. Está separado porque a regra AQUI é a
 * funcionalidade inteira -- o resto é uma lâmpada e um balão.
 *
 * O QUE A LÂMPADA FAZ
 * Um card por dia, no máximo, e só o que aquela pessoa ainda não viu.
 * Quando acaba, ela apaga. Apagada não é defeito: é "você está em dia".
 *
 * POR QUE NÃO É UM SORTEIO, que seria mais simples de escrever:
 * medido em 03/09/2026, o acervo tem 35 perguntas já respondidas e
 * apenas 10 abaixo de 70% de acerto. Sorteando, o mesmo card volta em
 * poucos dias -- e uma peça fixa que se repete é uma peça que se aprende
 * a ignorar. Perde-se a funcionalidade inteira para economizar uma
 * tabela.
 *
 * A ORDEM DE PREFERÊNCIA, e o motivo de cada degrau:
 *
 *   1. O QUE ESTA PESSOA ERROU. Foi o pedido do dono -- "ajudaria o
 *      colaborador a rever as perguntas que errou". É também o card mais
 *      certeiro que existe: não é estatística sobre o time, é um erro
 *      dela, registrado. Por isso não exige amostra mínima nem teto de
 *      acerto: uma pergunta que 95% acerta e ELA errou continua sendo
 *      exatamente o que ela precisa rever.
 *
 *   2. AS MAIS ERRADAS DA ÁREA DELA. Vale quando os próprios erros
 *      acabam -- a mediana é de 3 erros por pessoa, então isso acontece
 *      já na primeira semana. Aqui sim entram as duas travas abaixo,
 *      porque agora é estatística sobre os outros.
 *
 * Nada de "curiosidade genérica": tudo o que aparece saiu de uma
 * pergunta real, com a explicação que a liderança já revisou contra o
 * padrão. O app não inventa procedimento -- a mesma regra que vale na
 * geração das perguntas vale aqui.
 */

import type { AreaId } from "@/lib/areas";

/**
 * Abaixo disto a pergunta não vira card do nível 2.
 *
 * Uma pergunta que 9 em 10 acertam não ensina ninguém; ocupa a tela e
 * gasta o único card do dia. O corte em 70% não é redondo por acaso --
 * é onde a distribuição do acervo separa as duas pontas: em 03/09/2026,
 * 10 perguntas abaixo dele e 25 acima.
 */
export const TETO_DE_ACERTO = 70;

/**
 * Amostra mínima para a taxa de acerto do time valer alguma coisa.
 *
 * As perguntas mais erradas do Armazém tinham 4 respostas cada quando
 * isto foi escrito. "0% de acerto" apurado em 4 pessoas não é um ponto
 * fraco do time, é ruído -- e apontá-lo como se fosse mandaria o time
 * estudar o que ninguém errou. Mesmo raciocínio do piso de horas no
 * ranking do armazém.
 */
export const MINIMO_DE_RESPOSTAS = 5;

export type Candidata = {
  questaoId: number;
  pergunta: string;
  /** O texto da alternativa correta. */
  resposta: string;
  explicacao: string;
  area: AreaId;
  /** Contadores do banco (quiz_questoes). */
  acertos: number;
  erros: number;
  /** Esta pessoa respondeu errado em alguma rodada? */
  euErrei: boolean;
};

export type Dica = Candidata & {
  /** Por que esta apareceu -- a tela diz isso em uma linha. */
  motivo: "meu_erro" | "area_erra";
  /** Percentual de acerto do time, ou null sem amostra suficiente. */
  pctAcerto: number | null;
};

/** Taxa de acerto do time, ou null quando a amostra não sustenta. */
export function pctDeAcerto(acertos: number, erros: number): number | null {
  const total = acertos + erros;
  if (total < MINIMO_DE_RESPOSTAS) return null;
  return Math.round((acertos / total) * 100);
}

/**
 * A próxima dica desta pessoa -- ou null, e aí a lâmpada não acende.
 *
 * `vistas` são os ids que ela já viu, incluindo os de hoje. Quem chama é
 * que decide se hoje já teve card (ver voce-sabia-server.ts): esta
 * função responde só "qual seria a próxima".
 */
export function escolherDica(
  candidatas: Candidata[],
  vistas: Set<number>,
): Dica | null {
  const novas = candidatas.filter((c) => !vistas.has(c.questaoId));

  // Nível 1: erro próprio. Entre vários, o mais errado pelo time primeiro
  // -- se ela errou duas e o time também erra uma delas, essa é a que
  // vale mais a pena rever.
  const meus = novas
    .filter((c) => c.euErrei)
    .sort((a, b) => taxaCrua(a) - taxaCrua(b));

  if (meus.length > 0) {
    const c = meus[0];
    return { ...c, motivo: "meu_erro", pctAcerto: pctDeAcerto(c.acertos, c.erros) };
  }

  // Nível 2: o que a área erra. Agora com amostra mínima e teto.
  const daArea = novas
    .filter((c) => {
      const pct = pctDeAcerto(c.acertos, c.erros);
      return pct !== null && pct < TETO_DE_ACERTO;
    })
    .sort((a, b) => taxaCrua(a) - taxaCrua(b));

  if (daArea.length > 0) {
    const c = daArea[0];
    return { ...c, motivo: "area_erra", pctAcerto: pctDeAcerto(c.acertos, c.erros) };
  }

  return null;
}

/**
 * Taxa de acerto sem piso de amostra -- só para ORDENAR.
 *
 * Ordenar não é afirmar: aqui um 0% de 4 respostas apenas fica na frente
 * de um 60% de 30. Quem decide se ele PODE aparecer é o filtro acima,
 * que exige a amostra. Sem amostra nenhuma vai para o fim (1), e não
 * para a frente com um 0% que não significa nada.
 */
function taxaCrua(c: Candidata): number {
  const total = c.acertos + c.erros;
  if (total === 0) return 1;
  return c.acertos / total;
}

/** A linha que explica por que este card apareceu. */
export function fraseDoMotivo(dica: Dica, areaCurta: string): string {
  if (dica.motivo === "meu_erro") {
    return "Você errou esta no desafio";
  }
  return dica.pctAcerto === null
    ? `Uma das mais erradas em ${areaCurta}`
    : `Só ${dica.pctAcerto}% acertaram esta em ${areaCurta}`;
}

/**
 * O dia da operação, em "AAAA-MM-DD".
 *
 * Em UTC-3 e não no fuso do servidor: a Vercel roda em UTC, e às 21h de
 * um dia lá já é o dia seguinte. Sem isto, a lâmpada de quem abre o app
 * no fim do turno acenderia duas vezes no mesmo dia.
 */
export function diaDaOperacao(quando: Date = new Date()): string {
  return quando.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
