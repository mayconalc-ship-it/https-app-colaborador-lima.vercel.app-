export const NOMES_TIME = {
  DU: "Distribuição Urbana (DU)",
  AL: "Armazém Logístico (AL)",
} as const;

export type TimeRanking = keyof typeof NOMES_TIME;

export const TIMES = Object.keys(NOMES_TIME) as TimeRanking[];

export function ehTimeValido(valor: string): valor is TimeRanking {
  return valor in NOMES_TIME;
}

// Sugestoes, nao regra: a premiacao muda de mes para mes e nem sempre todas
// as categorias sao apuradas. Antes essa lista era fixa e a tela publica
// mostrava um bloco "sem foto" para cada categoria nao lancada. Agora o app
// mostra so o que foi lancado, e o admin digita o nome da categoria --
// estas entradas apenas aparecem no autocompletar, junto com o que ja foi
// usado nos meses anteriores.
export const SUGESTOES_POR_TIME: Record<TimeRanking, readonly string[]> = {
  DU: [
    "Motorista Sede",
    "Motorista PA",
    "Ajudante Sede",
    "Ajudante PA",
    "Rating Motorista",
    "Rating Ajudante",
    "Consumo de Combustível",
  ],
  AL: [
    "Conferente",
    "Ajudante AL",
    "Operador de Empilhadeira",
    "Manobrista/Mecânico",
  ],
};

export const LIMITE_CATEGORIA = 60;

export function normalizarCategoria(valor: string) {
  return valor.replace(/\s+/g, " ").trim().slice(0, LIMITE_CATEGORIA);
}
