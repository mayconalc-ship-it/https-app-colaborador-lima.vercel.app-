/**
 * LANÇAMENTO CURTO DEMAIS (14/09/2026, pedido do dono).
 *
 * O tempo de bancada, despejo e abastecimento é o intervalo entre Iniciar
 * e Finalizar. Quando alguém inicia e finaliza em seguida -- porque o
 * trabalho já tinha acabado e só faltava "registrar" --, o indicador grava
 * segundos em vez do tempo real. Aconteceu com o T3 da bancada (15
 * lançamentos, todos em segundos) e com um despejo de 45 L em 15 s, que
 * apareceu no BI como 10.859 L/h.
 *
 * Regra: menos de 1 minuto entre Iniciar e Finalizar só passa CONFIRMADO.
 * A tela pergunta (FormFinalizarCronometro) e o servidor recusa sem a
 * confirmação -- a regra vale nos dois lados.
 */
export const DURACAO_MINIMA_SEGUNDOS = 60;
export const CAMPO_CONFIRMA_CURTO = "confirmar_duracao_curta";

export function segundosDesde(inicio: string, agora = Date.now()): number {
  return Math.max(0, Math.round((agora - new Date(inicio).getTime()) / 1000));
}

/** Os segundos, quando é curto e ninguém confirmou; null quando pode seguir. */
export function duracaoCurtaSemConfirmar(inicio: string, formData: FormData): number | null {
  const segundos = segundosDesde(inicio);
  if (segundos >= DURACAO_MINIMA_SEGUNDOS) return null;
  return formData.get(CAMPO_CONFIRMA_CURTO) === "1" ? null : segundos;
}

export function mensagemDuracaoCurta(segundos: number): string {
  return (
    `Este lançamento durou só ${segundos} segundo${segundos === 1 ? "" : "s"}. ` +
    "O tempo conta do Iniciar ao Finalizar: se o trabalho já tinha acabado quando você iniciou, " +
    "o indicador registra segundos em vez do tempo real. Se foi isso mesmo, finalize de novo e confirme."
  );
}
