"use client";

import { usePathname } from "next/navigation";

/**
 * O SELO DPO COMO MARCA D'ÁGUA (03/10/2026, pedido do dono: "deixar
 * esfumaçado nas telas -- é algo de orgulho").
 *
 * Como num documento oficial: está em toda tela, e não disputa com o
 * trabalho. Grande, quase transparente e desfocado, ancorado no canto de
 * baixo e cortado pela borda -- um carimbo, não um adesivo no meio da
 * tela. Fica ATRÁS do conteúdo (o <main> do layout sobe uma camada), não
 * recebe toque e some na impressão.
 *
 * Na home não aparece: lá o selo já está inteiro, ao lado da saudação.
 * O selo vem da revenda (Admin > Revendas); sem selo, nada aparece.
 * O `key` pelo endereço refaz a entrada suave a cada tela aberta.
 */
export function SeloMarcaDagua({ src }: { src: string | null }) {
  const caminho = usePathname();
  if (!src || !caminho || caminho === "/" || caminho.startsWith("/login") || caminho.startsWith("/votar")) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={caminho} src={src} alt="" aria-hidden className="selo-marca-dagua" draggable={false} />
  );
}
