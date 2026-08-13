"use client";

import { useRef, useState } from "react";
import { useConfirmacao } from "@/components/Confirmacao";
import { formatarData, type Recontagem } from "@/lib/ativo-giro";

/** Quantos pixels de arrasto contam como "dispensei", não "toquei sem querer". */
const LIMIAR_PX = 80;

/**
 * Um pedido de recontagem pendente, na aba Contagem.
 *
 * Duas respostas explícitas, lado a lado: **Aceitar** coloca o formulário
 * acima em modo recontagem, **Recusar** tira o cartão da SUA tela e deixa o
 * pedido de pé para o resto do time.
 *
 * Os botões existem porque o gesto sozinho não bastava: dispensar era só
 * arrastar para o lado, e gesto invisível é gesto que ninguém descobre --
 * quem não sabia ficava com o cartão preso na tela para sempre, e o
 * controle não tinha como saber se o pedido estava parado por recusa ou
 * por ninguém ter visto. Agora recusar é um toque, e fica registrado.
 *
 * O arrasto continua funcionando como atalho de quem já o conhecia. Ele é
 * o único caminho que NÃO pergunta antes: arrastar já é deliberado o
 * bastante, e o pedido continua vivo para o time de qualquer forma.
 *
 * Ponteiro (não touch/mouse separados) porque cobre celular e desktop com
 * o mesmo código, e é o que permite testar isto num navegador comum.
 */
export function CartaoRecontagem({
  r,
  aceita,
  aoRecontar,
  aoDispensar,
}: {
  r: Recontagem;
  /** Este é o pedido que a pessoa está atendendo agora. */
  aceita: boolean;
  aoRecontar: () => void;
  aoDispensar: () => void;
}) {
  const confirmar = useConfirmacao();
  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const inicioX = useRef<number | null>(null);

  function aoPressionar(e: React.PointerEvent) {
    // Os botões NÃO fazem parte da superfície de arrasto. Enquanto faziam,
    // um toque que escorregasse os 80px do limiar disparava as duas coisas:
    // começando em "Aceitar", o pedido era recusado e o clique ainda
    // entrava -- a pessoa pedia para recontar e via o cartão sumir;
    // começando em "Recusar", o cartão voava antes de a confirmação
    // aparecer, e a pergunta ficava órfã na tela.
    if ((e.target as HTMLElement).closest("button")) return;

    inicioX.current = e.clientX;
    // Sem capturar o ponteiro, um arrasto que desvie para fora do cartão
    // -- que tem uns 70px de altura, então basta o dedo subir um pouco --
    // deixa de mandar `pointermove` e `pointerup` para cá. `aoSoltar`
    // nunca roda, e o cartão fica plantado no meio da tela, torto e
    // translúcido, até a página recarregar. Mesmo motivo do arrasto da
    // foto ampliada (ver FotoAmpliavel).
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastando(true);
  }

  function aoMover(e: React.PointerEvent) {
    if (inicioX.current === null) return;
    setDeslocamento(e.clientX - inicioX.current);
  }

  function sair() {
    setSaindo(true);
    // O cartão termina de deslizar para fora antes de a linha sumir de
    // vez -- sem isto o dispensar corta o gesto no meio, e parece bug.
    setTimeout(aoDispensar, 150);
  }

  function aoSoltar() {
    if (inicioX.current === null) return;
    inicioX.current = null;
    setArrastando(false);

    if (Math.abs(deslocamento) > LIMIAR_PX) sair();
    else setDeslocamento(0);
  }

  /**
   * Recusar pergunta antes. Ao contrário do arrasto, o botão fica no
   * caminho do polegar que ia mirar em "Aceitar" -- e recusar sem querer
   * some com o cartão sem deixar rastro na tela de quem recusou.
   */
  async function recusar() {
    const ok = await confirmar({
      titulo: "Recusar esta recontagem?",
      detalhe: `"${r.descricao}" sai da sua tela. O pedido continua de pé para o resto do time.`,
      confirmar: "Recusar",
      perigo: false,
    });
    if (ok) sair();
  }

  return (
    <div
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      style={{
        transform: `translateX(${saindo ? (deslocamento >= 0 ? 400 : -400) : deslocamento}px)`,
        opacity: saindo ? 0 : 1 - Math.min(Math.abs(deslocamento) / 300, 0.7),
        transition: arrastando ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
        touchAction: "pan-y",
      }}
      className={`select-none rounded-xl border p-3 ${
        aceita ? "border-primary bg-primary-soft/40" : "border-gold bg-amber-50"
      }`}
    >
      <p
        className={`text-sm font-bold ${aceita ? "text-primary-dark" : "text-amber-900"}`}
      >
        🔁 Recontagem pedida
      </p>
      <p className={`text-xs ${aceita ? "text-primary-dark" : "text-amber-700"}`}>
        {r.descricao} — {formatarData(r.dia)}, pedido por {r.solicitadoNome}
      </p>

      {/* Os botões descem para uma faixa própria em vez de dividir a linha
          com o texto: em 360px, três colunas espremiam a descrição até
          duas palavras por linha. */}
      {aceita ? (
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-primary-dark">
          ✔️ Aceita — lance a contagem no formulário abaixo.
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={aoRecontar}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            ✔️ Aceitar e recontar
          </button>
          <button
            type="button"
            onClick={recusar}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            ✖️ Recusar
          </button>
        </div>
      )}
    </div>
  );
}
