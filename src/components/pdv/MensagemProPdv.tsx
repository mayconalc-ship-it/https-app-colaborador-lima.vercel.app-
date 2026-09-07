"use client";

import { useState } from "react";

/**
 * A MENSAGEM PRONTA, com os dois caminhos que o monitoramento usa.
 *
 * WhatsApp e "copiar", e os dois existem por motivos diferentes. O link do
 * WhatsApp abre a conversa com o texto já escrito, mas SEM destinatário --
 * o app não guarda o telefone do PDV, e inventar um cadastro de telefone
 * para isso seria mais uma lista para manter em dia. Quem envia escolhe o
 * contato, que é o que ela já faz hoje. O copiar serve para o resto: o
 * grupo da rota, o e-mail, o vendedor.
 *
 * O TEXTO FICA VISÍVEL antes de enviar, e isso não é enfeite: mensagem
 * pronta que sai sem ser lida é como se manda "Bom dia!" às 16h para um
 * cliente que já recebeu. Quem envia é responsável pelo que envia.
 */
export function MensagemProPdv({ texto, nome }: { texto: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem clipboard (navegador antigo, http): abre o texto para a pessoa
      // selecionar à mão em vez de não fazer nada.
      setAberto(true);
    }
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
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white active:bg-emerald-700"
        >
          Enviar no WhatsApp
        </a>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 active:bg-emerald-100"
        >
          {copiado ? "✅ Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
