"use client";

import { useLinkStatus } from "next/link";

/**
 * Bolinha que pulsa dentro de um link enquanto a próxima tela vem.
 *
 * Preenche a janela entre o toque e o esqueleto do `loading.tsx`. Numa
 * rede boa essa janela é curta e nada aparece (a animação só começa aos
 * 120ms, de propósito); na rede do motorista em rota ela é justamente o
 * que faltava para a pessoa saber que o app ouviu o toque.
 *
 * Precisa ficar DENTRO de um <Link> -- é de lá que o hook lê o estado.
 */
export function DicaLink() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`dica-link ${pending ? "carregando" : ""}`}
    />
  );
}
