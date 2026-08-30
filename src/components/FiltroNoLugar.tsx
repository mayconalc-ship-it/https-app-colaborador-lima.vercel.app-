"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Um filtro que NÃO joga a pessoa para o topo da tela.
 *
 * Formulário GET comum faz navegação inteira: o navegador recarrega e
 * volta ao início do app. Quem estava lá embaixo na "Evolução da média
 * h/P20" trocava "dia" por "semana", clicava em Aplicar e tinha que
 * navegar de volta até a seção -- toda vez.
 *
 * Aqui o envio vira `router.replace` com `scroll: false`, então a página
 * atualiza no lugar. O `method="get"` continua no elemento de propósito:
 * sem JavaScript o filtro ainda funciona, só volta a rolar para o topo.
 *
 * `secao` é o que mantém o agrupamento ABERTO depois de filtrar -- ele
 * viaja na URL e a tela reabre o `<details>` correspondente.
 */
export function FiltroNoLugar({
  secao,
  className,
  children,
}: {
  /** Id da seção que deve continuar aberta. Vai como `?secao=`. */
  secao?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, comecarTransicao] = useTransition();

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    const p = new URLSearchParams();
    for (const [chave, valor] of dados.entries()) {
      // Campo vazio sai da URL: um "?ordem=" solto vira ruído e, em
      // alguns filtros, um valor inválido que a tela tem que tratar.
      if (typeof valor === "string" && valor !== "") p.set(chave, valor);
    }
    if (secao) p.set("secao", secao);
    // Mensagem de uma ação anterior não sobrevive a um filtro novo.
    p.delete("sucesso");
    p.delete("erro");

    comecarTransicao(() => {
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    });
  }

  return (
    <form method="get" onSubmit={aoEnviar} className={className}>
      {/* Sem JavaScript o GET normal acontece -- e o `secao` garante que
          pelo menos o agrupamento certo reabra. */}
      {secao && <input type="hidden" name="secao" value={secao} />}
      {children}
    </form>
  );
}
