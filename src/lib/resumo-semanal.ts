/**
 * RESUMO SEMANAL DA LIDERANÇA -- as regras puras (16/09/2026).
 *
 * Pedido do dono: toda segunda de manhã, uma notificação para a liderança
 * com o ranking da semana, as metas e as pendências.
 *
 * A semana é de SEGUNDA a DOMINGO, no fuso da operação. O aviso sai na
 * segunda a partir das 7h, sobre a semana que terminou no domingo -- a
 * semana corrente ainda está acontecendo, e um resumo dela mudaria a cada
 * hora.
 *
 * Sem banco aqui, para as regras caberem num teste.
 */

/** A partir desta hora de segunda-feira (São Paulo) o resumo sai. */
export const HORA_DO_RESUMO = 7;

const PARTES_SP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});

/** Data (AAAA-MM-DD), dia da semana (0 = domingo) e hora, no fuso da operação. */
export function agoraEmSP(agora: Date = new Date()) {
  const p = Object.fromEntries(PARTES_SP.formatToParts(agora).map((x) => [x.type, x.value]));
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    diaDaSemana: dias.indexOf(p.weekday),
    // "24" é meia-noite em alguns motores com hour12: false.
    hora: Number(p.hour) % 24,
  };
}

/** Soma dias a uma data AAAA-MM-DD, sem passar por fuso nenhum. */
export function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A segunda-feira da semana de um dia (AAAA-MM-DD). */
export function segundaDaSemana(dia: string) {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(dia, semana === 0 ? -6 : 1 - semana);
}

export type Semana = { inicio: string; fim: string };

/** A última semana FECHADA (segunda a domingo) antes de hoje. */
export function semanaAnterior(hoje: string): Semana {
  const inicio = somarDias(segundaDaSemana(hoje), -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** A semana que começa numa segunda -- ou `null` se o dia não é uma segunda válida. */
export function semanaQueComecaEm(dia: string | undefined): Semana | null {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  if (Number.isNaN(new Date(`${dia}T12:00:00Z`).getTime())) return null;
  if (segundaDaSemana(dia) !== dia) return null;
  return { inicio: dia, fim: somarDias(dia, 6) };
}

/** É hora de mandar o resumo? Segunda-feira, a partir das 7h. */
export function ehHoraDoResumo(agora: Date = new Date()) {
  const { diaDaSemana, hora } = agoraEmSP(agora);
  return diaDaSemana === 1 && hora >= HORA_DO_RESUMO;
}

/** "08/09 a 14/09". */
export function rotuloDaSemana(s: Semana) {
  const curto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return `${curto(s.inicio)} a ${curto(s.fim)}`;
}

/** A chave do aviso: um por revenda por semana, nunca dois. */
export function chaveDoResumo(revendaId: string, s: Semana) {
  return `resumo-semanal:${revendaId}:${s.inicio}`;
}

/** As pendências que viram frase na notificação -- só as que existem. */
export function frasesDasPendencias(p: {
  praticasEmAnalise: number | null;
  materiaisAbaixoDaMinima: number | null;
  tratativasPendentes: number | null;
  recontagensAbertas: number | null;
}) {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const frases: string[] = [];
  if (p.praticasEmAnalise) frases.push(plural(p.praticasEmAnalise, "boa prática para avaliar", "boas práticas para avaliar"));
  if (p.materiaisAbaixoDaMinima)
    frases.push(plural(p.materiaisAbaixoDaMinima, "material abaixo da mínima", "materiais abaixo da mínima"));
  if (p.tratativasPendentes)
    frases.push(plural(p.tratativasPendentes, "5 Porquês esperando resposta", "5 Porquês esperando resposta"));
  if (p.recontagensAbertas) frases.push(plural(p.recontagensAbertas, "recontagem de AG aberta", "recontagens de AG abertas"));
  return frases;
}
