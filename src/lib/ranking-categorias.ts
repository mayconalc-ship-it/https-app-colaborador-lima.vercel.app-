export const CATEGORIAS_POR_TIME = {
  DU: [
    "Motorista Sede",
    "Motorista PA",
    "Ajudante Sede",
    "Ajudante PA",
    "Rating Motorista",
    "Rating Ajudante",
    "Consumo de Combustível",
  ],
  AL: ["Conferente", "Ajudante AL", "Operador de Empilhadeira", "Manobrista/Mecânico"],
} as const;

export type TimeRanking = keyof typeof CATEGORIAS_POR_TIME;

export const NOMES_TIME: Record<TimeRanking, string> = {
  DU: "Distribuição Urbana (DU)",
  AL: "Armazém Logístico (AL)",
};
