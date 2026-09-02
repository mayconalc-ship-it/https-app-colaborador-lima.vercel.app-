/**
 * O AVISO DEPOIS DE ATUALIZAR UM INDICADOR
 *
 * Importou o Rating, o Refugo ou a Devolução? Quem ganhou pendência fica
 * sabendo, com o número dela.
 *
 * A regra que importa aqui é NEGATIVA: avisa-se apenas quem tem algo a
 * fazer. Um aviso de "os indicadores foram atualizados" para todo mundo é
 * ruído -- chega para quem não tem nada pendente, ensina a ignorar, e aí
 * o aviso que importava passa despercebido junto. "Você tem 3 avaliações
 * para explicar" é outra coisa: é tarefa, e tem dono.
 *
 * Só a regra aqui, sem banco.
 */

export type IndicadorAvisavel = "rating" | "refugo" | "devolucao";

/**
 * Só pendência RECENTE gera aviso.
 *
 * Sem esta janela, o primeiro aviso viraria uma cobrança de dívida
 * histórica: a simulação com os dados reais deu "61 aferições com
 * refugo" e "36 dias acima da meta" para uma pessoa só, quase tudo de
 * meses atrás, de quando o campo de explicação nem existia.
 *
 * Ninguém volta para explicar 61 coisas. Recebe, se sente devendo o
 * impossível, e ignora -- e o próximo aviso, o que era sobre ontem, vai
 * junto. Trinta dias é o que a pessoa ainda lembra.
 */
export const DIAS_DE_PENDENCIA = 30;

/** A data mais antiga que ainda gera aviso, em ISO curto. */
export function desdeQuandoAvisar(agora = new Date()): string {
  return new Date(agora.getTime() - DIAS_DE_PENDENCIA * 86_400_000).toISOString().slice(0, 10);
}

export const ROTA_DO_INDICADOR: Record<IndicadorAvisavel, string> = {
  rating: "/rating",
  refugo: "/refugo",
  devolucao: "/devolucao",
};

/**
 * O texto do aviso.
 *
 * Convida, não cobra. A explicação do colaborador é o que separa a falha
 * dele da falha da operação -- e boa parte não é dele. Um aviso que soa a
 * advertência faz a pessoa escrever menos, ou escrever o mínimo para se
 * livrar, que é pior que não escrever.
 */
export function textoDoAviso(
  indicador: IndicadorAvisavel,
  pendencias: number,
): { titulo: string; mensagem: string } {
  const um = pendencias === 1;

  if (indicador === "rating") {
    return {
      titulo: um ? "⭐ 1 cliente para você contar o que houve" : `⭐ ${pendencias} clientes insatisfeitos`,
      mensagem: um
        ? "Uma entrega sua levou menos de 5 estrelas. Conta pra gente o que aconteceu — boa parte não é de quem entrega, e sua explicação é o que mostra isso."
        : `${pendencias} entregas suas levaram menos de 5 estrelas. Conta pra gente o que aconteceu em cada uma — boa parte não é de quem entrega, e sua explicação é o que mostra isso.`,
    };
  }

  if (indicador === "refugo") {
    return {
      titulo: um ? "♻️ 1 aferição com refugo" : `♻️ ${pendencias} aferições com refugo`,
      mensagem: um
        ? "Uma aferição sua deu refugo. Se a garrafa já veio danificada, ou houve outro motivo, registra lá — sem isso o número fica parecendo culpa sua."
        : `${pendencias} aferições suas deram refugo. Se as garrafas já vieram danificadas, ou houve outro motivo, registra lá — sem isso o número fica parecendo culpa sua.`,
    };
  }

  return {
    titulo: um ? "↩️ 1 dia acima da meta de devolução" : `↩️ ${pendencias} dias acima da meta`,
    mensagem: um
      ? "Um dia seu passou da meta de devolução. Conta o que aconteceu — cliente fechado, pedido errado e nota rejeitada não são falha de quem entrega, mas isso só aparece se você disser."
      : `${pendencias} dias seus passaram da meta de devolução. Conta o que aconteceu em cada um — cliente fechado, pedido errado e nota rejeitada não são falha de quem entrega, mas isso só aparece se você disser.`,
  };
}

/**
 * Junta as pendências por pessoa.
 *
 * Uma avaliação tem motorista E ajudante; uma aferição tem os dois mais o
 * conferente. Todos precisam poder explicar, então a mesma pendência
 * conta para cada um deles -- mas UMA VEZ por pessoa, senão quem aparece
 * duas vezes na mesma linha receberia "2 pendências" para uma só.
 */
export function contarPendenciasPorPessoa(
  itens: { id: string; pessoas: (string | null)[] }[],
): Map<string, number> {
  const porPessoa = new Map<string, Set<string>>();
  for (const item of itens) {
    for (const pessoa of new Set(item.pessoas)) {
      if (!pessoa) continue;
      const seus = porPessoa.get(pessoa) ?? new Set<string>();
      seus.add(item.id);
      porPessoa.set(pessoa, seus);
    }
  }
  return new Map([...porPessoa].map(([pessoa, ids]) => [pessoa, ids.size]));
}

/**
 * Não avisar de novo o que já foi avisado.
 *
 * Importar duas vezes no mesmo dia é comum -- corrigir a pasta, reimportar
 * um mês. Sem esta trava, a pessoa levaria o mesmo aviso a cada
 * importação, e é assim que uma notificação útil vira spam em uma semana.
 */
export const HORAS_ENTRE_AVISOS = 20;

export function podeAvisar(
  ultimoAvisoEm: string | null | undefined,
  agora = new Date(),
): boolean {
  if (!ultimoAvisoEm) return true;
  const horas = (agora.getTime() - new Date(ultimoAvisoEm).getTime()) / 3_600_000;
  return horas >= HORAS_ENTRE_AVISOS;
}
