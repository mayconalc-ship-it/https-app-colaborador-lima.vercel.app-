/**
 * Perfil por HORA DO DIA.
 *
 * A tela de indicadores respondia "quanto" e "quem", nunca "quando".
 * Sem isso, um TMA alto vira conversa sobre a velocidade das pessoas
 * quando o problema costuma ser de FILA: quatro carretas chegando às 7h
 * e nenhuma às 14h dão o mesmo total diário, com operações
 * completamente diferentes. O mesmo vale para a empilhadeira -- saber a
 * hora de pico é o que permite escalar gente e máquina para o pico em
 * vez de para a média.
 *
 * Tudo aqui é no fuso da operação (America/Sao_Paulo). Ler a hora em UTC
 * jogaria o pico das 21h para a madrugada do dia seguinte e a leitura
 * inteira iria junto.
 */

const FUSO = "America/Sao_Paulo";

/** A hora local (0-23) de um instante, no fuso da operação. */
export function horaLocal(instante: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      hour: "2-digit",
      hour12: false,
    }).format(instante),
  );
}

/** Um vetor de 24 posições zerado -- a forma de todo perfil daqui. */
const vinteQuatroZeros = () => Array.from({ length: 24 }, () => 0);

/**
 * Quantos EVENTOS caem em cada hora do dia.
 *
 * Para carimbos pontuais: chegada de carreta, abertura de operação,
 * pedido de ressuprimento.
 */
export function contagemPorHora(instantes: (string | null | undefined)[]): number[] {
  const horas = vinteQuatroZeros();
  for (const i of instantes) {
    if (!i) continue;
    const d = new Date(i);
    if (Number.isNaN(d.getTime())) continue;
    horas[horaLocal(d)] += 1;
  }
  return horas;
}

/**
 * Quantas HORAS de atividade caem em cada hora do dia.
 *
 * Para intervalos: uma operação de empilhadeira das 6h40 às 9h20 pesa
 * 0,33h nas 6h, 1h nas 7h, 1h nas 8h e 0,33h nas 9h. Contar só o início
 * colocaria as três horas de trabalho todas às 6h e o pico apareceria
 * uma hora cedo demais.
 *
 * O passo é ancorado no RELÓGIO, não no início do intervalo. Andar de 15
 * em 15 minutos a partir das 6h40 daria um passo 6h55-7h10 inteirinho na
 * hora 6, e a hora 6 ficaria com meia hora em vez de vinte minutos -- o
 * pico saía de lugar. Cortando na grade do relógio, cada fatia cai
 * inteira dentro de uma hora só e a conta fica exata.
 *
 * (A grade de 15 min basta porque o fuso da operação é deslocado em
 * horas cheias: toda virada de hora local é também uma virada de quarto
 * de hora no epoch.)
 *
 * `limiteHoras` corta intervalos absurdos (a operação que ninguém
 * fechou e ficou aberta cinco dias). Sem ele, um único registro
 * esquecido achataria o perfil inteiro em 24 barras iguais.
 *
 * `peso` troca O QUE se distribui. Sem ele, distribui o tempo de relógio
 * do intervalo. Com ele, distribui o número dado -- espalhado na mesma
 * proporção. É o que separa "a empilhadeira ficou ATRIBUÍDA a alguém das
 * 6h às 15h" (9h de relógio) de "a empilhadeira RODOU 3h nesse período"
 * (3h de horímetro), que é o que a pergunta "quando a máquina é usada"
 * quer saber. A distribuição uniforme é uma suposição declarada: não há
 * carimbo de quando o motor ligou e desligou dentro da operação.
 */
export function horasPorHora(
  intervalos: { inicio: string; fim: string | null; peso?: number | null }[],
  limiteHoras = 24,
): number[] {
  const horas = vinteQuatroZeros();
  const PASSO_MS = 15 * 60 * 1000;

  for (const { inicio, fim, peso } of intervalos) {
    if (!fim) continue;
    const t0 = new Date(inicio).getTime();
    const t1 = new Date(fim).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    // Peso informado e zerado/negativo: a operação não rendeu nada, e
    // desenhar o tempo de relógio no lugar inventaria uso que não houve.
    if (peso !== undefined && peso !== null && peso <= 0) continue;

    const fimEfetivo = Math.min(t1, t0 + limiteHoras * 3_600_000);
    const horasDeRelogio = (fimEfetivo - t0) / 3_600_000;
    // Quanto do `peso` cabe em cada hora de relógio percorrida.
    const escala =
      peso === undefined || peso === null || horasDeRelogio <= 0 ? 1 : peso / horasDeRelogio;

    let t = t0;
    while (t < fimEfetivo) {
      // Até a próxima marca do relógio, ou até o fim -- o que vier antes.
      const proximo = Math.min(fimEfetivo, Math.ceil((t + 1) / PASSO_MS) * PASSO_MS);
      horas[horaLocal(new Date(t))] += ((proximo - t) / 3_600_000) * escala;
      t = proximo;
    }
  }

  return horas.map((h) => Math.round(h * 100) / 100);
}

/**
 * A média de um valor por hora do dia -- para "TMA por hora de chegada".
 *
 * Devolve `null` na hora sem amostra em vez de 0: zero seria lido como
 * "às 3h da manhã a carreta sai na hora", quando o que houve foi
 * nenhuma carreta às 3h.
 */
export function mediaPorHora(
  amostras: { instante: string | null; valor: number | null }[],
): (number | null)[] {
  const soma = vinteQuatroZeros();
  const n = vinteQuatroZeros();

  for (const a of amostras) {
    if (!a.instante || a.valor === null || !Number.isFinite(a.valor)) continue;
    const d = new Date(a.instante);
    if (Number.isNaN(d.getTime())) continue;
    const h = horaLocal(d);
    soma[h] += a.valor;
    n[h] += 1;
  }

  return soma.map((s, h) => (n[h] === 0 ? null : Math.round((s / n[h]) * 10) / 10));
}

/** "07h" -- o rótulo curto do eixo. */
export function rotuloHora(h: number): string {
  return `${String(h).padStart(2, "0")}h`;
}
