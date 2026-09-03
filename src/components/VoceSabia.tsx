"use client";

import { useEffect, useRef, useState } from "react";
import { fraseDoMotivo, type Dica } from "@/lib/voce-sabia";
import { alternarCurtida, marcarVista } from "@/app/desafio/voce-sabia/actions";

/**
 * A LÂMPADA -- "Você sabia?", no canto do app.
 *
 * Fechada é só um botão redondo. Aberta, um balão que sai DE DENTRO dela:
 * a animação cresce a partir do canto de baixo, do lado da própria
 * lâmpada, e a pontinha aponta para ela. É o que faz o balão ser lido
 * como "a lâmpada está falando" em vez de "apareceu uma janela".
 *
 * O PONTINHO DOURADO só existe quando há card NOVO. Depois de aberto, a
 * lâmpada continua ali o resto do dia, apagada e discreta, para quem
 * quiser reler -- some sozinha amanhã, quando o servidor tiver outro card
 * (ou nenhum). Quem decide isso é o voce-sabia-server.ts; aqui só se
 * desenha o que ele mandou.
 *
 * Some em duas situações, e as duas de propósito: quando não há card (a
 * lâmpada apagada é a mensagem "você está em dia") e enquanto qualquer
 * modal está aberto, porque um botão flutuante sobre um diálogo é um
 * alvo de toque atrás de outro.
 */
export function VoceSabia({
  dica,
  jaVistaHoje,
  curtiu: curtiuInicial,
  areaCurta,
}: {
  dica: Dica;
  jaVistaHoje: boolean;
  curtiu: boolean;
  areaCurta: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [curtiu, setCurtiu] = useState(curtiuInicial);
  const [novo, setNovo] = useState(!jaVistaHoje);
  /** Meio segundo de "apagando" logo depois de fechar o balão. */
  const [apagando, setApagando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Esc fecha, como em todo overlay do app.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function abrir() {
    setAberto(true);
    if (novo) {
      // A leitura é gravada AQUI, na abertura. A tela não espera a
      // resposta: se falhar, o pior caso é o mesmo card aparecer amanhã,
      // o que ninguém percebe como defeito.
      void marcarVista(dica.questaoId).catch(() => {});
    }
  }

  /**
   * A LÂMPADA APAGA AO FECHAR, e não ao abrir -- pedido do dono
   * (03/09/2026): "após ele clicar e ler a do dia, ela apaga sozinha".
   *
   * A diferença importa. Apagando na abertura, o brilho sumia atrás do
   * balão, onde ninguém vê; a pessoa fechava e encontrava um botão
   * diferente, sem ligar uma coisa à outra. Apagando na saída, ela VÊ a
   * luz se apagar -- e é isso que diz "esta eu já li, volta amanhã".
   *
   * Os 600ms são a duração da animação: o estado só vira "lida" quando
   * ela termina, senão o CSS trocaria no meio e o efeito engasgaria.
   */
  function fechar() {
    setAberto(false);
    if (novo) {
      setApagando(true);
      setTimeout(() => {
        setApagando(false);
        setNovo(false);
      }, 600);
    }
  }

  function curtir() {
    const proximo = !curtiu;
    setCurtiu(proximo);
    void alternarCurtida(dica.questaoId, proximo).catch(() => {
      // Voltar o coração é mais honesto do que deixá-lo cheio mentindo.
      setCurtiu(!proximo);
    });
  }

  return (
    <>
      {/* Fundo que fecha ao tocar fora. Quase transparente: o balão é uma
          conversa lateral, não um bloqueio da tela -- escurecer tudo daria
          a ela um peso de aviso importante que ela não tem. */}
      {aberto && (
        <div
          role="presentation"
          onClick={fechar}
          className="fixed inset-0 z-40 bg-slate-900/10"
        />
      )}

      {/*
        NO PÉ DA HOME, À DIREITA, E O BALÃO ABRE PARA CIMA.

        Ela passou por três lugares até aqui, e o que decidiu foi limitar
        ONDE ela existe, não empurrá-la mais um canto.

        Embaixo, no app inteiro, ela cobria os cartões do menu. Em cima à
        direita sobrepunha o ✕ de fechar das telas internas -- os dois em
        `right-4`, e no celular o ✕ ocupa de 80 a 120px do topo contra 68
        a 116px da lâmpada: colisão cheia, não de raspão. No cabeçalho
        resolvia os dois, mas ficava discreta demais para o gosto do dono.

        SÓ NA HOME (ver app/page.tsx), e é isso que fecha a conta: a home
        é a única tela sem ✕, e é onde a pessoa está entre uma tarefa e
        outra -- que é o momento de parar para ler uma dica. Nas telas de
        trabalho a lâmpada não tinha o que fazer mesmo: ninguém interrompe
        um apontamento de reepack para revisar pergunta de desafio.

        O dono chegou a sugerir deixar arrastar. Não foi por aí: cada uma
        das ~67 pessoas teria de descobrir sozinha que dá para mover, e
        arrastar disputa com rolar o mesmo gesto no celular.
      */}
      {/* `bottom-5` mais a área segura do iPhone: no aparelho com barra
          de gestos, `bottom-4` puro deixava o botão em cima dela, e o
          gesto de voltar pegava antes do toque. */}
      <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-2 print:hidden">
        {aberto && (
          <div
            ref={caixa}
            role="dialog"
            aria-label="Você sabia?"
            // SEM `overflow-hidden`: era ele que cortava a pontinha.
            // A pontinha fica FORA da caixa, por definição -- é o pedaço
            // que sai dela em direção à lâmpada -- e um recorte no pai
            // some com ela sem deixar vestígio. Os cantos arredondados,
            // que era o motivo do overflow, agora são dados a cada faixa
            // (o cabeçalho arredonda em cima, o rodapé embaixo).
            className="balao-abre relative w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start gap-2 rounded-t-2xl border-b border-slate-100 bg-gold-soft px-4 py-2.5">
              <span className="text-lg" aria-hidden="true">
                💡
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary-dark">Você sabia?</p>
                <p className="text-[11px] leading-tight text-primary">
                  {fraseDoMotivo(dica, areaCurta)}
                </p>
              </div>
              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar"
                className="-mr-1 -mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-slate-500 hover:bg-black/5"
              >
                ✕
              </button>
            </div>

            {/* Rola por dentro: a explicação de uma pergunta de padrão
                passa de dez linhas, e um balão que cresce até cobrir a
                tela deixa de ser balão. */}
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {dica.pergunta}
              </p>

              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Resposta certa
                </p>
                <p className="mt-0.5 text-sm font-medium text-emerald-900">
                  {dica.resposta}
                </p>
              </div>

              {dica.explicacao && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {dica.explicacao}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-b-2xl border-t border-slate-100 bg-white px-3 py-2">
              {/* Curtir não vale ponto e a tela não promete que valha: o
                  texto fala do conteúdo ("útil"), não da pessoa. */}
              <button
                type="button"
                onClick={curtir}
                aria-pressed={curtiu}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  curtiu
                    ? "bg-red-50 text-red-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <span
                  className={curtiu ? "circulo-pulsa" : ""}
                  aria-hidden="true"
                >
                  {curtiu ? "❤️" : "🤍"}
                </span>
                {curtiu ? "Curtiu" : "Curtir"}
              </button>

              <span className="pr-1 text-[10px] text-slate-400">
                Do Desafio do Mês
              </span>
            </div>

            {/* A pontinha, encostada embaixo à direita -- é ela que liga
                o balão à lâmpada, que fica ABAIXO dele. Um quadrado
                girado 45°, mostrando só as duas bordas viradas para
                baixo; o fundo é o mesmo do rodapé do balão, senão a
                emenda apareceria como um degrau.

                Ela vive FORA da caixa, por definição -- foi por isso que
                o `overflow-hidden` do balão a fazia sumir sem deixar
                vestígio. Os cantos arredondados, que era o motivo do
                overflow, são dados faixa a faixa. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => (aberto ? fechar() : abrir())}
          aria-expanded={aberto}
          aria-label={
            novo ? "Você sabia? Há uma dica nova" : "Você sabia? Ver a dica"
          }
          // ACESA de verdade quando há dica nova: 56px, dourado cheio e
          // um halo que respira em volta. O pontinho sozinho era pequeno
          // demais para ser notado no pé de uma tela cheia de cartões
          // (pedido do dono, 03/09/2026). Lida, ela encolhe para 48px e
          // volta ao branco discreto -- continua ali para reler, sem
          // disputar atenção com o resto.
          className={`relative flex items-center justify-center rounded-full border shadow-lg transition-all duration-300 ${
            apagando ? "lampada-apaga" : novo ? "lampada-acesa" : ""
          } ${
            novo
              ? "h-14 w-14 border-gold bg-gold text-2xl text-primary-dark"
              : "h-12 w-12 border-slate-200 bg-white text-xl text-slate-500"
          }`}
        >
          💡
          {novo && (
            <span
              aria-hidden="true"
              className="lampada-pisca absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary"
            />
          )}
        </button>

        {/* O rótulo aparece só enquanto a dica é nova, e some junto com o
            brilho. Um botão redondo com uma lâmpada não diz o que faz --
            o dono já perguntou o que era. Duas palavras resolvem, e sair
            depois de lido devolve a tela ao que ela era. */}
        {novo && !aberto && (
          <span className="pointer-events-none absolute bottom-1 right-16 whitespace-nowrap rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-primary-dark shadow-md">
            Você sabia?
          </span>
        )}
      </div>
    </>
  );
}