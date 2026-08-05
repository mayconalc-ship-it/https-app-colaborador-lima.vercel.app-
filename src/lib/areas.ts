export const AREAS = [
  { id: "DU", rotulo: "Distribuição Urbana", curto: "Distribuição" },
  { id: "AL", rotulo: "Armazém Logístico", curto: "Armazém" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

export function ehAreaValida(valor: string): valor is AreaId {
  return AREAS.some((a) => a.id === valor);
}

export function ehPdf(url: string | null | undefined) {
  return Boolean(url && url.toLowerCase().includes(".pdf"));
}
