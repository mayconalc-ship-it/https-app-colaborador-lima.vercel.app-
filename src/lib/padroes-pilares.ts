// Em ordem alfabética: é assim que o colaborador procura o pilar.
export const PILARES = [
  "Armazém",
  "Controle",
  "Entrega",
  "Frota",
  "Planejamento",
] as const;

export type Pilar = (typeof PILARES)[number];

export const ICONE_TIPO: Record<string, string> = {
  docx: "📝",
  doc: "📝",
  xlsx: "📊",
  xlsb: "📊",
  pdf: "📄",
  pptx: "📽️",
  mp4: "🎬",
};

export function iconePorTipo(tipo: string) {
  return ICONE_TIPO[tipo] ?? "📎";
}

/**
 * Ordena como uma pessoa espera: respeita acentos do português e trata
 * números como número — assim "10 - Plano" vem depois de "2 - Rota", e não
 * antes como aconteceria numa comparação de texto pura.
 */
export function compararTextoPtBr(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}
