/** Motivos oferecidos quando a nota é baixa. */
export const MOTIVOS = [
  { id: "dificil", rotulo: "Difícil de usar" },
  { id: "pouco_conteudo", rotulo: "Pouco conteúdo" },
  { id: "desatualizado", rotulo: "Informações desatualizadas" },
  { id: "falta_funcao", rotulo: "Falta alguma funcionalidade" },
  { id: "problema_tecnico", rotulo: "Problema técnico" },
  { id: "outro", rotulo: "Outro" },
] as const;

const IDS_VALIDOS = new Set(MOTIVOS.map((m) => m.id as string));

export function ehMotivoValido(id: string) {
  return IDS_VALIDOS.has(id);
}

export function rotuloMotivo(id: string) {
  return MOTIVOS.find((m) => m.id === id)?.rotulo ?? id;
}

/** Abaixo de 3 estrelas o motivo é obrigatório: nota baixa sem causa não ajuda. */
export function motivoObrigatorio(nota: number) {
  return nota <= 2;
}

/**
 * Agrupamento de análise — só para o painel. O colaborador nunca vê estes
 * nomes; para ele existe apenas a nota que ele deu.
 */
export type Grupo = "promotor" | "neutro" | "detrator";

export function grupoDaNota(nota: number): Grupo {
  if (nota === 5) return "promotor";
  if (nota >= 3) return "neutro";
  return "detrator";
}

export type ConfigPesquisa = {
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
  ciclo: string;
  titulo: string;
};

/**
 * A pesquisa está no ar? Precisa estar ligada E dentro do período.
 *
 * A comparação é feita em texto "AAAA-MM-DD" de propósito: o servidor da
 * Vercel roda em UTC e converter para Date faria a virada do dia acontecer
 * às 21h daqui.
 */
export function dentroDoPeriodo(config: ConfigPesquisa, hojeIso: string) {
  if (!config.ativa) return false;
  if (config.inicio && hojeIso < config.inicio) return false;
  if (config.fim && hojeIso > config.fim) return false;
  return true;
}

/** Data de hoje em "AAAA-MM-DD", no fuso da operação. */
export function hojeIso() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bahia",
  });
}

/** "2026-08" vira "Agosto/2026", que é como o time fala. */
export function rotuloCiclo(ciclo: string) {
  const m = ciclo.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ciclo;

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return ciclo;
  return `${meses[mes - 1]}/${m[1]}`;
}
