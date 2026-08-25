/**
 * Recebimento de Carretas (TMA) - regras de domínio.
 *
 * Fonte única da verdade dos tipos e cálculos. Mesmo desenho de
 * lib/produtividade-armazem.ts: sem tabela de consolidação, o TMA é
 * calculado na leitura, em cima dos timestamps gravados em cada etapa.
 */

export const STATUS_ATENDIMENTO = [
  "aguardando_conferente",
  "em_descarga",
  "em_carga",
  "finalizado",
] as const;
export type StatusAtendimento = (typeof STATUS_ATENDIMENTO)[number];

export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  aguardando_conferente: "Aguardando conferente",
  em_descarga: "Descarregando",
  em_carga: "Carregando",
  finalizado: "Finalizado",
};

export const UNIDADES_ITEM = ["palete", "caixa"] as const;
export type UnidadeItem = (typeof UNIDADES_ITEM)[number];

export const ROTULO_UNIDADE_ITEM: Record<UnidadeItem, string> = {
  palete: "Palete",
  caixa: "Caixa",
};

export function ehUnidadeItem(v: unknown): v is UnidadeItem {
  return typeof v === "string" && (UNIDADES_ITEM as readonly string[]).includes(v);
}

export type TipoNota = "produto" | "remessa";

export type NotaFiscal = {
  tipo: TipoNota;
  numero: string;
  serie: string;
};

export type ItemDescarga = {
  id: string;
  produtoId: string;
  produtoCodigo: string;
  produtoDescricao: string;
  quantidade: number;
  unidade: UnidadeItem;
  lote: string;
  validade: string;
  empilhador: string;
};

export type AtendimentoCarreta = {
  id: string;
  fabricaId: string;
  fabricaNome: string;
  transportadoraId: string;
  transportadoraNome: string;
  numeroDt: string;
  motoristaNome: string;
  agendamentoEm: string | null;
  cargaAgendada: boolean;
  placaCavalo: string;
  placaCarreta: string;
  chegadaEm: string;
  portariaNome: string;
  status: StatusAtendimento;
  inicioAtendimentoEm: string | null;
  conferenteNome: string | null;
  fimDescargaEm: string | null;
  temCarga: boolean | null;
  inicioCargaEm: string | null;
  fimCargaEm: string | null;
  finalizacaoEm: string | null;
  notas: NotaFiscal[];
  itens: ItemDescarga[];
};

/** Minutos entre dois ISO, sempre positivo (nunca negativo por relógio
 *  de cliente/servidor levemente fora de sincronia). */
function minutosEntre(inicioISO: string, fimISO: string): number {
  const ms = new Date(fimISO).getTime() - new Date(inicioISO).getTime();
  return Math.max(ms, 0) / 60_000;
}

/**
 * TMA: se a carga era agendada, conta a partir do horário agendado (é a
 * régua que a fábrica/transportadora combinou); senão, conta a partir do
 * apontamento real da portaria. Só existe depois que a descarga termina.
 */
export function calcularTmaMinutos(a: AtendimentoCarreta): number | null {
  if (!a.fimDescargaEm) return null;
  const inicio = a.cargaAgendada && a.agendamentoEm ? a.agendamentoEm : a.chegadaEm;
  return Math.round(minutosEntre(inicio, a.fimDescargaEm));
}

/** Espera na portaria: quanto tempo até o conferente assumir. Indicador
 *  auxiliar, não entra no TMA -- serve para separar "gargalo de fila" de
 *  "gargalo de descarga". */
export function calcularEsperaPortariaMinutos(a: AtendimentoCarreta): number | null {
  if (!a.inicioAtendimentoEm) return null;
  return Math.round(minutosEntre(a.chegadaEm, a.inicioAtendimentoEm));
}

/** Tempo de carga, separado do TMA de descarga -- só existe quando
 *  tem_carga = true e a carga já terminou. */
export function calcularTempoCargaMinutos(a: AtendimentoCarreta): number | null {
  if (!a.inicioCargaEm || !a.fimCargaEm) return null;
  return Math.round(minutosEntre(a.inicioCargaEm, a.fimCargaEm));
}

/** Tempo total no pátio: chegada até a saída (finalização). */
export function calcularTempoPatioMinutos(a: AtendimentoCarreta): number | null {
  if (!a.finalizacaoEm) return null;
  return Math.round(minutosEntre(a.chegadaEm, a.finalizacaoEm));
}

/** "1h 20min" / "45min" -- nunca "0h", para não esconder um lançamento
 *  rápido demais atrás de um arredondamento. */
export function formatarMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
}

/** Minutos decorridos desde um ISO até agora -- alimenta o contador ao
 *  vivo do Monitor (client-side, recalculado a cada tick). */
export function minutosDesde(iso: string, agora = new Date()): number {
  return Math.max(Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000), 0);
}

export function quantidadePositiva(v: unknown, max = 100_000): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    throw new Error("Quantidade inválida: use um número maior que zero.");
  }
  return Math.round(n * 100) / 100;
}
