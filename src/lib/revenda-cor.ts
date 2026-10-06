/**
 * A COR DE CADA REVENDA (05/10/2026).
 *
 * Relato do dono: na Gestão de Acessos "às vezes acho que estou mexendo em
 * um ambiente e é outro". O nome da revenda aparecia, mas pequeno, no meio
 * de outros botões -- e as duas revendas tinham a mesma cara.
 *
 * É o que os consoles de nuvem fazem com conta de produção e de teste: cada
 * ambiente com uma cor própria, a mesma em todo lugar, para o olho perceber
 * a troca antes de a leitura perceber. Aqui a cor aparece na faixa da
 * revenda no topo da Gestão de Acessos, no botão de salvar da ficha e no
 * seletor 🏢 do cabeçalho.
 *
 * Nenhuma das cores é azul (o azul é a cor do próprio app) nem vermelha (a
 * cor de perigo das confirmações). Módulo puro: entra em componente de
 * cliente.
 */
export type CorDaRevenda = {
  /** Fundo forte, com texto branco por cima. */
  forte: string;
  /** Fundo suave, para áreas grandes. */
  suave: string;
  borda: string;
  texto: string;
  /** A bolinha do seletor. */
  ponto: string;
};

// As classes são escritas por extenso: o Tailwind só gera o que lê no
// código, e uma classe montada por concatenação não existiria no CSS.
const PALETA: CorDaRevenda[] = [
  { forte: "bg-teal-600", suave: "bg-teal-50", borda: "border-teal-600", texto: "text-teal-800", ponto: "bg-teal-500" },
  { forte: "bg-orange-600", suave: "bg-orange-50", borda: "border-orange-600", texto: "text-orange-800", ponto: "bg-orange-500" },
  { forte: "bg-violet-600", suave: "bg-violet-50", borda: "border-violet-600", texto: "text-violet-800", ponto: "bg-violet-500" },
  { forte: "bg-pink-600", suave: "bg-pink-50", borda: "border-pink-600", texto: "text-pink-800", ponto: "bg-pink-500" },
  { forte: "bg-lime-700", suave: "bg-lime-50", borda: "border-lime-700", texto: "text-lime-900", ponto: "bg-lime-600" },
  { forte: "bg-cyan-700", suave: "bg-cyan-50", borda: "border-cyan-700", texto: "text-cyan-900", ponto: "bg-cyan-600" },
];

/** As revendas de hoje, com cores opostas de propósito. */
const POR_SLUG: Record<string, number> = {
  "sao-felix": 0,
  barreiras: 1,
};

/**
 * Revenda nova sem cor combinada cai na paleta pelo slug -- sempre a mesma
 * para a mesma revenda. Quando a terceira entrar, vale pôr uma linha em
 * POR_SLUG para garantir que não repita a cor de outra.
 */
export function corDaRevenda(slug: string): CorDaRevenda {
  const fixo = POR_SLUG[slug];
  if (fixo !== undefined) return PALETA[fixo];
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[2 + (h % (PALETA.length - 2))];
}
