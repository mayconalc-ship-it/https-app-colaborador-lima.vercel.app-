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
  const caixa = useRef<HTMLDivElement>(null);

  // Esc fecha, como em todo overlay do app.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    if (novo) {
      // O card do dia é gasto AQUI, na abertura. A tela não espera a
      // resposta: o pontinho apaga na hora e a gravação segue por conta
      // dela -- se falhar, o pior caso é o mesmo card aparecer amanhã, o
      // que ninguém percebe como defeito.
      setNovo(false);
      void marcarVista(dica.questaoId).catch(() => {});
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
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-40 bg-slate-900/10"
        />
      )}

      {/*
        A LÂMPADA MORA NO CABEÇALHO, ao lado do sino.

        Ela já esteve em dois cantos flutuantes, e os dois brigaram com
        alguma coisa. Embaixo à direita cobria os cartões do menu: quem ia
        tocar num módulo acertava a lâmpada. Em cima à direita sobrepunha
        o ✕ de fechar da própria página -- os dois ficam em `right-4`, e
        no celular o ✕ ocupa de 80 a 120px do topo contra 68 a 116px da
        lâmpada. Colisão cheia, não de raspão (relatado em 03/09/2026).

        O dono sugeriu deixar a pessoa ARRASTAR a lâmpada. Resolveria o
        sintoma, mas ao preço errado: cada uma das ~67 pessoas teria de
        descobrir sozinha que dá para mover e então mover, e enquanto não
        movesse continuaria com o botão em cima do ✕. Fora que arrastar e
        rolar disputam o mesmo gesto no celular -- o dedo que sobe a tela
        acabaria levando a lâmpada junto.

        O cabeçalho resolve por CONSTRUÇÃO, para todo mundo de uma vez: é
        uma faixa que já existe para ícones, com espaço próprio, e nenhum
        conteúdo passa por baixo dela. De quebra a lâmpada fica ao lado do
        sino, e os dois dizem a mesma coisa -- "tem algo novo para você".
        Um terceiro canto flutuante só encontraria o próximo botão.
      */}
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-expanded={aberto}
        aria-label={
          novo ? "Você sabia? Há uma dica nova" : "Você sabia? Ver a dica"
        }
        className={`relative shrink-0 rounded-lg px-2 py-1.5 text-base transition-colors ${
          novo ? "bg-gold" : "bg-white/10 hover:bg-white/20"
        }`}
      >
        💡
        {novo && (
          <span
            aria-hidden="true"
            className="lampada-pisca absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary"
          />
        )}
      </button>

      {/* O balão desce do cabeçalho: a altura dele é 56px até 640px e
          88px daí para cima -- a mesma conta da barra do Admin. */}
      <div className="fixed right-2 top-[60px] z-40 flex flex-col items-end sm:right-4 sm:top-[92px] print:hidden">
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
                onClick={() => setAberto(false)}
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

            {/* A pontinha, encostada no topo à direita -- é ela que liga
                o balão à lâmpada, que agora fica ACIMA dele. Um quadrado
                girado 45°, mostrando só as duas bordas que ficam viradas
                para cima; a cor de fundo é a mesma do cabeçalho do balão,
                senão a emenda apareceria como um degrau. */}
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-gold-soft"
            />
          </div>
        )}
      </div>
    </>
  );
}
