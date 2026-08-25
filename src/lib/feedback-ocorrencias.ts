export const OCORRENCIAS = [
  { id: "cliente_fechado", emoji: "🏪", label: "Cliente fechado" },
  { id: "devolucao", emoji: "↩️", label: "Devolução / recusa" },
  { id: "falta_produto", emoji: "📦", label: "Falta de produto" },
  { id: "carga_errada", emoji: "🔀", label: "Carga errada" },
  { id: "veiculo", emoji: "🚚", label: "Problema no veículo" },
  { id: "transito", emoji: "🚦", label: "Trânsito / via bloqueada" },
  { id: "atraso_carregamento", emoji: "⏰", label: "Atraso no carregamento" },
  { id: "acesso_descarga", emoji: "🅿️", label: "Dificuldade de descarga" },
  { id: "pagamento", emoji: "💵", label: "Problema no pagamento" },
  { id: "seguranca", emoji: "⚠️", label: "Risco de segurança" },
] as const;

export const NOTAS = [
  { valor: 0, emoji: "😞", label: "Ruim" },
  { valor: 1, emoji: "😐", label: "Regular" },
  { valor: 2, emoji: "🙂", label: "Boa" },
  { valor: 3, emoji: "😄", label: "Ótima" },
] as const;

const MAPA_OCORRENCIAS = new Map(OCORRENCIAS.map((o) => [o.id, o]));

export function rotuloOcorrencia(id: string) {
  const item = MAPA_OCORRENCIAS.get(id as (typeof OCORRENCIAS)[number]["id"]);
  return item ? `${item.emoji} ${item.label}` : id;
}

/** Sem emoji -- para compor o contexto que vai para a IA do 5 Porquês,
 *  não para exibir na tela. */
export function labelOcorrencia(id: string) {
  return MAPA_OCORRENCIAS.get(id as (typeof OCORRENCIAS)[number]["id"])?.label ?? id;
}

export function rotuloNota(nota: number) {
  const item = NOTAS.find((n) => n.valor === nota);
  return item ? `${item.emoji} ${item.label}` : String(nota);
}

/**
 * "Ruim" e "Regular" (as duas notas de baixo, de quatro) exigem comentário.
 * Mesmo corte de "nota ruim" usado na Pesquisa de Satisfação, adaptado
 * para esta escala de 0 a 3 em vez de 1 a 5.
 */
export function notaRuim(nota: number) {
  return nota <= 1;
}

/** Rota "Ruim" (a pior nota) obriga o motorista a fazer o 5 Porquês antes
 *  de conseguir enviar -- "Regular" segue outro caminho (tratativa da
 *  liderança), não este. */
export function notaExigeCincoPorques(nota: number) {
  return nota === 0;
}

/** Rota "Regular" entra na fila de tratativa da liderança em
 *  /admin/feedbacks -- é a liderança quem responde, não o motorista. */
export function notaExigeTratativa(nota: number) {
  return nota === 1;
}
