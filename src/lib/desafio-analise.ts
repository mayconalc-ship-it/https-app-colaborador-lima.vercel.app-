/**
 * O que os números do Desafio do Mês dizem sobre TREINAMENTO.
 *
 * O Desafio já tinha classificação e medalhas -- o lado jogo, que é o
 * que faz as pessoas responderem. O que faltava era o lado gestão: uma
 * rodada com 62% de acerto não é um placar, é um diagnóstico de que
 * 38% do time não sabe o procedimento que foi perguntado. Sem isso o
 * desafio virava entretenimento com ranking.
 *
 * As funções daqui são puras de propósito: as regras de leitura ("uma
 * pergunta fácil errada por metade da equipe é um alerta", "responder
 * em 4 segundos e errar é chute") são decisões de operação, não de
 * banco, e decisão de operação merece teste.
 */

export type RespostaCrua = {
  questaoId: number;
  correta: boolean;
  tempoMs: number;
};

export type QuestaoCrua = {
  id: number;
  pergunta: string;
  dificuldade: string;
  padraoNome: string | null;
  atividade: string | null;
  pilar: string | null;
};

export type DesempenhoDaQuestao = {
  id: number;
  pergunta: string;
  dificuldade: string;
  origem: string;
  respondida: number;
  acertos: number;
  /** 0 a 100. `null` quando ninguém respondeu -- não é 0%. */
  pctAcerto: number | null;
  /** Segundos médios para responder. */
  segundosMedio: number | null;
  /** Errada E respondida no susto: quase sempre chute, não desconhecimento. */
  cheiroDeChute: boolean;
};

/**
 * Abaixo disto, a pergunta praticamente não foi lida.
 *
 * Quatro segundos é o tempo de ler o enunciado e mais nada. Errar
 * depois de pensar é falta de conhecimento -- treina-se. Errar em
 * quatro segundos é pressa, e cobrar conteúdo de quem só clicou rápido
 * treina a coisa errada.
 */
export const SEGUNDOS_DE_CHUTE = 4;

/** Abaixo disto a pergunta vira pauta de treinamento, não curiosidade. */
export const ALERTA_DE_ACERTO = 60;

export function desempenhoPorQuestao(
  questoes: QuestaoCrua[],
  respostas: RespostaCrua[],
): DesempenhoDaQuestao[] {
  return questoes
    .map((q) => {
      const dela = respostas.filter((r) => r.questaoId === q.id);
      const acertos = dela.filter((r) => r.correta).length;
      const pctAcerto = dela.length > 0 ? Math.round((acertos / dela.length) * 100) : null;
      const segundosMedio =
        dela.length > 0
          ? Math.round((dela.reduce((s, r) => s + r.tempoMs, 0) / dela.length / 1000) * 10) / 10
          : null;

      return {
        id: q.id,
        pergunta: q.pergunta,
        dificuldade: q.dificuldade,
        // A ORIGEM é o que torna o número acionável. "62% de acerto" é
        // uma nota; "62% de acerto no POP-ARM-001, item 7.2" é uma
        // pauta de treinamento com endereço.
        origem: q.padraoNome ?? q.atividade ?? q.pilar ?? "sem padrão de origem",
        respondida: dela.length,
        acertos,
        pctAcerto,
        segundosMedio,
        cheiroDeChute:
          pctAcerto !== null &&
          pctAcerto < ALERTA_DE_ACERTO &&
          segundosMedio !== null &&
          segundosMedio <= SEGUNDOS_DE_CHUTE,
      };
    })
    // Só quem foi respondido: uma questão sem resposta nenhuma teria 0%
    // de acerto sem ninguém ter errado nada, e apareceria no topo da
    // lista de problemas sendo o único item sem problema.
    .filter((q) => q.respondida > 0);
}

export type GrupoDeAcerto = {
  chave: string;
  respondida: number;
  acertos: number;
  pctAcerto: number;
  questoes: number;
};

/**
 * Acerto agrupado por alguma coisa -- padrão de origem, dificuldade,
 * pilar.
 *
 * Sempre soma sobre soma, nunca média de percentuais: uma pergunta
 * respondida por 2 pessoas não pode pesar o mesmo que uma respondida
 * por 30 na nota do POP.
 */
export function acertoPorGrupo(
  desempenho: DesempenhoDaQuestao[],
  chave: (q: DesempenhoDaQuestao) => string,
): GrupoDeAcerto[] {
  const acc = new Map<string, { respondida: number; acertos: number; questoes: number }>();
  for (const q of desempenho) {
    const k = chave(q);
    const a = acc.get(k) ?? { respondida: 0, acertos: 0, questoes: 0 };
    a.respondida += q.respondida;
    a.acertos += q.acertos;
    a.questoes += 1;
    acc.set(k, a);
  }
  return [...acc.entries()]
    .map(([chave, a]) => ({
      chave,
      respondida: a.respondida,
      acertos: a.acertos,
      pctAcerto: a.respondida > 0 ? Math.round((a.acertos / a.respondida) * 100) : 0,
      questoes: a.questoes,
    }))
    // Do pior para o melhor: a lista existe para achar o que treinar.
    .sort((a, b) => a.pctAcerto - b.pctAcerto);
}

/**
 * Quantas pessoas tiraram cada nota.
 *
 * A média esconde a forma: 10 pessoas com 6 acertos e 10 pessoas
 * divididas entre 2 e 10 dão a mesma média e pedem ações opostas -- na
 * primeira treina-se todo mundo, na segunda treina-se metade.
 */
export function distribuicaoDeAcertos(
  acertosPorPessoa: number[],
  totalPerguntas: number,
): { acertos: number; pessoas: number }[] {
  const faixas = Array.from({ length: totalPerguntas + 1 }, (_, i) => ({ acertos: i, pessoas: 0 }));
  for (const a of acertosPorPessoa) {
    if (a >= 0 && a <= totalPerguntas) faixas[a].pessoas += 1;
  }
  return faixas;
}

/** A cor de um percentual de acerto -- a mesma régua em toda a tela. */
export function tomDoAcerto(pct: number | null): "bom" | "atencao" | "ruim" | "neutro" {
  if (pct === null) return "neutro";
  if (pct >= 80) return "bom";
  if (pct >= ALERTA_DE_ACERTO) return "atencao";
  return "ruim";
}
