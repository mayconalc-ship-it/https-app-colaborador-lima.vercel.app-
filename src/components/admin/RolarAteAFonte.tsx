"use client";

import { useEffect } from "react";

/**
 * ROLA ATÉ A GAVETA QUE ACABOU DE SER SALVA.
 *
 * Pedido do dono (08/09/2026): "caso haja interação em salvar, não mova a
 * tela pra cima, deixe onde ela está".
 *
 * A âncora `#fonte-<chave>` sozinha NÃO resolve, e isso foi medido nesta
 * tela: depois do redirect, com o endereço terminando em `#fonte-clientes`,
 * o navegador parava com `scrollY = 0` e o cartão a 814px de distância. É o
 * comportamento do App Router -- a página é entregue em fluxo, e quando o
 * navegador procura o elemento do fragmento ele ainda não existe; o que
 * vale no fim é o reposicionamento no topo.
 *
 * Por isso um efeito, e não só a âncora: ele roda depois da montagem, com o
 * elemento já no lugar. A âncora fica no endereço mesmo assim -- é ela que
 * faz o link copiado abrir na fonte certa.
 *
 * `smooth` de propósito: um salto seco depois de salvar parece recarga de
 * página, e a pergunta vira "cadê o que eu escrevi?". O movimento mostra
 * que a tela é a mesma.
 */
export function RolarAteAFonte({ chave }: { chave: string }) {
  useEffect(() => {
    const alvo = document.getElementById(`fonte-${chave}`);
    if (!alvo) return;
    // Quem pediu para não ser movido não quer um pulo brusco: se o cartão
    // já está visível, fica onde está.
    const caixa = alvo.getBoundingClientRect();
    const visivel = caixa.top >= 0 && caixa.top < window.innerHeight * 0.6;
    if (visivel) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [chave]);

  return null;
}
