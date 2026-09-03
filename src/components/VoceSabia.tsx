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

      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
        {aberto && (
          <div
            ref={caixa}
            role="dialog"
            aria-label="Você sabia?"
            className="balao-abre relative w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start gap-2 border-b border-slate-100 bg-gold-soft px-4 py-2.5">
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

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
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

            {/* A pontinha, encostada no canto de baixo à direita -- é ela
                que liga o balão à lâmpada. Um quadrado girado, com as duas
                bordas visíveis do lado certo. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => (aberto ? setAberto(false) : abrir())}
          aria-expanded={aberto}
          aria-label={
            novo ? "Você sabia? Há uma dica nova" : "Você sabia? Ver a dica"
          }
          className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-xl shadow-lg transition-colors ${
            novo
              ? "border-gold bg-gold text-primary-dark"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          💡
          {novo && (
            <span
              aria-hidden="true"
              className="lampada-pisca absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-primary"
            />
          )}
        </button>
      </div>
    </>
  );
}
