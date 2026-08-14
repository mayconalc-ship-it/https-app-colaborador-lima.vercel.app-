export const PROBLEMAS = [
  { id: "atraso_rota", emoji: "⏰", label: "Atraso na rota" },
  { id: "cliente_fechado", emoji: "🏪", label: "Cliente fechado / recusou" },
  { id: "nao_localizei", emoji: "📍", label: "Não consegui localizar o cliente" },
  { id: "retornei_carga", emoji: "↩️", label: "Retornei com carga" },
  { id: "veiculo", emoji: "🚚", label: "Problema com veículo" },
  { id: "pedido", emoji: "📦", label: "Problema com pedido" },
  { id: "acesso_descarga", emoji: "🅿️", label: "Dificuldade de descarga" },
  { id: "pagamento", emoji: "💵", label: "Problema com pagamento" },
  { id: "aplicativo", emoji: "📱", label: "Problema no aplicativo / sistema" },
  { id: "outro", emoji: "✏️", label: "Outro" },
] as const;

export type ProblemaId = (typeof PROBLEMAS)[number]["id"];

export const CATEGORIAS = [
  { id: "pessoas", label: "Pessoas" },
  { id: "processo", label: "Processo" },
  { id: "rota", label: "Rota" },
  { id: "cliente", label: "Cliente" },
  { id: "veiculo", label: "Veículo" },
  { id: "pedido", label: "Pedido" },
  { id: "sistema", label: "Sistema" },
  { id: "estoque", label: "Estoque" },
  { id: "comunicacao", label: "Comunicação" },
  { id: "externo", label: "Externo" },
  { id: "outro", label: "Outro" },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]["id"];

const MAPA_PROBLEMAS = new Map(PROBLEMAS.map((p) => [p.id, p]));
const MAPA_CATEGORIAS = new Map(CATEGORIAS.map((c) => [c.id, c]));

export function rotuloProblema(id: string) {
  const item = MAPA_PROBLEMAS.get(id as ProblemaId);
  return item ? `${item.emoji} ${item.label}` : id;
}

export function rotuloCategoria(id: string) {
  return MAPA_CATEGORIAS.get(id as CategoriaId)?.label ?? id;
}
