/**
 * RECONHECIMENTO DO 5S -- as regras, num lugar só (21/09/2026).
 *
 * O reconhecimento das melhores áreas acontece no grupo de WhatsApp; o
 * app guarda a evidência (mês, áreas, texto e fotos) para o DPO 3.1 (V.6).
 * A tela trava o botão com estas funções e o servidor confere com as MESMAS.
 */

export const LIMITES_RECONHECIMENTO = {
  fotosMin: 1,
  fotosMax: 8,
  bytesPorFoto: 3 * 1024 * 1024,
  /** O envio inteiro: a Vercel recusa corpo acima de ~4,5 MB. */
  bytesPorEnvio: 4 * 1024 * 1024,
  areasMax: 20,
  textoMax: 400,
} as const;

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function validarReconhecimento(d: {
  competencia: string;
  areas: string[];
  texto: string;
  fotos: { tamanho: number; tipo: string }[];
}): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.competencia)) return "Escolha o mês do resultado reconhecido.";
  if (d.areas.length === 0) return "Marque pelo menos uma área reconhecida.";
  if (d.areas.length > LIMITES_RECONHECIMENTO.areasMax) return "Áreas demais num reconhecimento só.";
  if (d.fotos.length < LIMITES_RECONHECIMENTO.fotosMin) return "Coloque a foto ou o print do reconhecimento.";
  if (d.fotos.length > LIMITES_RECONHECIMENTO.fotosMax) return `No máximo ${LIMITES_RECONHECIMENTO.fotosMax} fotos.`;
  for (const f of d.fotos) {
    if (f.tamanho <= 0) return "Uma das fotos veio vazia.";
    if (f.tamanho > LIMITES_RECONHECIMENTO.bytesPorFoto) return "Uma das fotos está grande demais.";
    if (f.tipo && !TIPOS.includes(f.tipo)) return "Envie só imagens (JPG, PNG ou WEBP).";
  }
  if (d.fotos.reduce((s, f) => s + f.tamanho, 0) > LIMITES_RECONHECIMENTO.bytesPorEnvio) {
    return "As fotos juntas passaram do limite de um envio. Mande em dois registros.";
  }
  if (d.texto.length > LIMITES_RECONHECIMENTO.textoMax) return `O texto passa de ${LIMITES_RECONHECIMENTO.textoMax} caracteres.`;
  return null;
}
