"use client";

/**
 * O botão de esvaziar a bombona, com confirmação.
 *
 * A primeira versão era um submit direto: um toque errado no celular
 * zerava a contagem de todo o armazém, e o número que a operação usa
 * para decidir a hora do descarte passava a mentir até a próxima troca
 * de verdade. Existe o "desfazer", mas ele só ajuda quem PERCEBEU o
 * clique -- e o clique errado é justamente o que ninguém percebe.
 *
 * A confirmação mostra o volume que está sendo zerado. "Confirma?" sem
 * número é uma pergunta que todo mundo responde no automático; "zerar
 * 812,5 L?" faz quem clicou sem querer parar.
 */
export function BotaoEsvaziarBombona({ litros }: { litros: number }) {
  const volume = litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <button
      type="submit"
      onClick={(e) => {
        const ok = window.confirm(
          `Esvaziar a bombona?\n\n` +
            `A contagem vai de ${volume} L para 0 L e recomeça agora.\n\n` +
            `Faça isso só depois de descartar de verdade — os lançamentos, o ranking e os litros por turno não mudam.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
    >
      🪣 Esvaziei a bombona
    </button>
  );
}

/**
 * O desfazer também pergunta -- por simetria e porque ele é destrutivo
 * na direção oposta: apaga o registro de um descarte que aconteceu, e a
 * bombona volta a somar litros de uma bombona que já foi embora.
 */
export function BotaoDesfazerEsvaziamento({ quando }: { quando: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        const ok = window.confirm(
          `Desfazer o esvaziamento de ${quando}?\n\n` +
            `A bombona volta a contar os litros de antes dele. Use só se o registro foi um engano.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="text-xs font-medium text-slate-500 underline"
    >
      desfazer o último
    </button>
  );
}
