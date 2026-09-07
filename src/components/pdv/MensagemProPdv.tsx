"use client";

import { useState } from "react";
import { linkDoWhatsApp } from "@/lib/clientes-base";

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
/** "5577999998888" -> "(77) 99999-8888". Só para a pessoa reconhecer o
 *  número antes de abrir a conversa -- número errado na base é coisa que
 *  acontece, e a hora de perceber é antes de mandar. */
function formatarTelefone(digitos: string): string {
  const n = digitos.replace(/\D/g, "").replace(/^55/, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return digitos;
}

export function MensagemProPdv({
  texto,
  nome,
  telefone = null,
}: {
  texto: string;
  nome: string;
  /** Da base de clientes. Com ele, o WhatsApp abre a conversa certa. */
  telefone?: string | null;
}) {
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
    //
    // COM TELEFONE ela vira rede de segurança, não a saída: o link já leva
    // o número, o WhatsApp abre a conversa certa e o texto sobrevive.
    await copiar();
    window.open(linkDoWhatsApp(telefone, texto), "_blank", "noopener");
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
          {telefone ? "Abrir a conversa no WhatsApp" : "Copiar e abrir o WhatsApp"}
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
        {telefone
          ? `Abre direto na conversa de ${formatarTelefone(telefone)}, com o texto escrito. A cópia vai junto, por garantia.`
          : copiado
            ? "✅ Na área de transferência — se o WhatsApp abrir em branco, é só colar."
            : "Sem telefone na base deste cliente: copia o texto antes de abrir, aí é só procurar o PDV e colar."}
      </p>
    </div>
  );
}
