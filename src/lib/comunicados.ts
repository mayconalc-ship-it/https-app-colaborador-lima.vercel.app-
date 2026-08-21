export const EDITORIAS = [
  { id: "seguranca", rotulo: "Segurança", emoji: "🦺", cor: "bg-red-100 text-red-800" },
  { id: "cultura", rotulo: "Cultura", emoji: "🎯", cor: "bg-purple-100 text-purple-800" },
  { id: "engajamento", rotulo: "Engajamento", emoji: "🎉", cor: "bg-amber-100 text-amber-800" },
  { id: "operacao", rotulo: "Operação", emoji: "🚚", cor: "bg-blue-100 text-blue-800" },
  { id: "gente", rotulo: "Gente", emoji: "👥", cor: "bg-green-100 text-green-800" },
  { id: "geral", rotulo: "Geral", emoji: "📰", cor: "bg-slate-100 text-slate-700" },
] as const;

export type EditoriaId = (typeof EDITORIAS)[number]["id"];

const MAPA = new Map(EDITORIAS.map((e) => [e.id, e]));

export function editoria(id: string) {
  return MAPA.get(id as EditoriaId) ?? MAPA.get("geral")!;
}

export function ehEditoriaValida(valor: string): valor is EditoriaId {
  return MAPA.has(valor as EditoriaId);
}

/**
 * O servidor da Vercel roda em UTC. Sem fixar o fuso, depois das 21h de
 * Bahia a data de "hoje" pularia para o dia seguinte na tela.
 */
const FUSO = "America/Bahia";

// A data vem como "2026-07-27". Montar com new Date(texto) aplicaria fuso
// UTC e podia mostrar o dia anterior, entao quebramos manualmente.
function paraDataLocal(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarData(data: string) {
  return paraDataLocal(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatarDataCurta(data: string) {
  return paraDataLocal(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Data de HOJE por extenso: "Sábado, 1 de agosto de 2026".
 *
 * Jornal de verdade traz a data da banca, não a da última matéria escrita.
 * Mostrar a data do último comunicado fazia o app parecer parado no tempo
 * sempre que passavam alguns dias sem publicação.
 */
export function dataDeHoje() {
  const texto = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: FUSO,
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Tempo de leitura. Um leitor comum faz ~200 palavras por minuto; abaixo de
 * um minuto não vale assustar ninguém com número, então arredonda para 1.
 */
export function tempoDeLeitura(texto: string) {
  const palavras = texto.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}

/**
 * O que vem de um `<input type="datetime-local">` ("AAAA-MM-DDTHH:mm",
 * sem fuso) para o instante UTC que o banco guarda.
 *
 * Bahia é sempre UTC-3 -- o Brasil não tem mais horário de verão desde
 * 2019 -- então a conta é uma soma fixa, sem precisar de Intl aqui.
 *
 * Serve tanto ao lembrete quanto ao agendamento da publicação: os dois
 * campos são o mesmo tipo de dado com significados diferentes.
 */
export function datetimeLocalParaUTC(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, ano, mes, dia, hora, min] = m.map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min)).toISOString();
}

/**
 * O caminho inverso: do instante UTC do banco para o valor que o
 * `<input type="datetime-local">` espera reabrir, no fuso de Bahia.
 *
 * Usa `Intl` em vez de subtrair 3h na mão -- é o mesmo resultado hoje,
 * mas não depende de ninguém lembrar da mesma conta em dois lugares.
 */
export function utcParaDatetimeLocal(utcISO: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcISO));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${parte("year")}-${parte("month")}-${parte("day")}T${parte("hour")}:${parte("minute")}`;
}

/**
 * Só o dia de um instante UTC, no fuso de Bahia: "2026-09-15".
 *
 * É o que faz a matéria agendada nascer com a data certa na banca.
 * Agendar para 15/09 às 08h e a matéria aparecer datada de 20/08 (o dia
 * em que o RH escreveu) seria um jornal mentindo a própria data -- e
 * pior, a matéria entraria no fim da lista, porque a ordenação da página
 * é por `data`.
 */
export function diaNoFuso(utcISO: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcISO));
}

/** Só a hora de um instante UTC, no fuso de Bahia: "08:00". */
export function horaNoFuso(utcISO: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcISO));
}

/** Está marcado para o futuro? Vale para o agendamento e para o lembrete. */
export function ehFuturo(utcISO: string | null | undefined): boolean {
  return Boolean(utcISO) && new Date(utcISO!).getTime() > Date.now();
}

/** "15/09 às 08:00" -- o rótulo do relógio e das tarjas de agendamento. */
export function formatarDiaEHora(utcISO: string) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcISO));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")} às ${parte("hour")}:${parte("minute")}`;
}

/** "12/08 às 14:00", para mostrar o lembrete na lista do Admin. */
export function formatarDataHora(utcISO: string) {
  return new Date(utcISO).toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
