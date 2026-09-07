"use client";

import { useState } from "react";

/**
 * A MENSAGEM PRONTA, com os dois caminhos que o monitoramento usa.
 *
 * SEM DESTINATÁRIO, e é uma escolha: o app não guarda o telefone do PDV, e
 * inventar esse cadastro seria mais uma lista para manter em dia. Quem
 * envia escolhe o contato, que é o que ela já faz hoje.
 *
 * COPIAR ANTES DE ABRIR (07/09/2026, teste do dono: "toda vez que vou
 * encaminhar ele pede para abrir o WhatsApp, e selecionando o WhatsApp Web
 * ele não copia a mensagem automático").
 *
 * Ele está certo, e a causa é do WhatsApp: um `wa.me` SEM número abre o
 * seletor de contato, e no Web o texto se perde no caminho -- ele só
 * sobrevive quando o link já diz para quem vai. Como não temos o número,
 * esse caso é o normal, não a exceção.
 *
 * Então o botão copia PRIMEIRO e abre depois. Se o texto vier preenchido,
 * ótimo; se não vier, ela cola -- e não precisa voltar à tela para copiar
 * de novo, que era o vaivém. O botão diz isso antes do clique, porque uma
 * cópia silenciosa faz a pessoa copiar de novo por desconfiança.
 *
 * O TEXTO FICA VISÍVEL antes de enviar, e isso não é enfeite: mensagem
 * pronta que sai sem ser lida é como mandar "Bom dia!" às 16h para um
 * cliente que já recebeu. Quem envia é responsável pelo que envia.
 */
export function MensagemProPdv({ texto, nome }: { texto: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function copiar(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
      return true;
    } catch {
      // Sem clipboard (navegador antigo, http): abre o texto para a pessoa
      // selecionar à mão em vez de não fazer nada.
      setAberto(true);
      return false;
    }
  }

  async function enviar() {
    // A cópia vem antes da janela nova: depois de o navegador trocar de
    // foco, a permissão de clipboard cai em vários aparelhos e a cópia
    // falha calada -- justamente no caso em que ela é a única saída.
    await copiar();
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  return (
    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-emerald-900"
      >
        <span>💬 Mensagem pronta para {nome}</span>
        <span className="text-emerald-700">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs leading-relaxed text-slate-700">
          {texto}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={enviar}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white active:bg-emerald-700"
        >
          Copiar e abrir o WhatsApp
        </button>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 active:bg-emerald-100"
        >
          {copiado ? "✅ Copiado" : "Só copiar"}
        </button>
      </div>

      {/* Dito antes do clique, e não como aviso de erro depois: no WhatsApp
          Web o texto se perde porque o link não tem destinatário, e quem
          não sabe disso acha que a mensagem sumiu. */}
      <p className="mt-1.5 text-[11px] leading-snug text-emerald-900/70">
        {copiado
          ? "✅ Na área de transferência — se o WhatsApp abrir em branco, é só colar."
          : "Copia o texto antes de abrir: no WhatsApp Web ele costuma abrir em branco, aí é só procurar o PDV e colar."}
      </p>
    </div>
  );
}
