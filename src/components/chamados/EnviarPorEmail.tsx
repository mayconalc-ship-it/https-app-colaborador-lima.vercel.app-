"use client";

import { useState } from "react";

/**
 * "Enviar por e-mail" (07/10/2026, pedido do dono) -- o chamado para os
 * e-mails cadastrados em Admin › Chamados.
 *
 * O app não envia sozinho: montar SMTP daria um remetente que ninguém
 * reconhece (mesma decisão da Blitz e da Mão de Obra). O botão principal
 * abre o Outlook Web do Microsoft 365 já com destinatários, assunto e
 * texto, e o e-mail sai da conta de quem tocou; o mailto fica para quem
 * usa o Outlook instalado.
 */
export function EnviarPorEmail({ destinatarios, assunto, texto }: { destinatarios: string[]; assunto: string; texto: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(destinatarios.join(";"))}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
  const mailto = `mailto:${destinatarios.join(",")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        ✉️ Enviar por e-mail
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-600">
            {destinatarios.length > 0 ? (
              <>
                Vai para: <strong className="break-all">{destinatarios.join(", ")}</strong>
              </>
            ) : (
              "Nenhum e-mail cadastrado em Admin › Chamados: o Outlook abre sem destinatário, para você escolher."
            )}
          </p>
          <details className="rounded-xl bg-slate-50">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600">Ver o texto do e-mail</summary>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-slate-700">{texto}</pre>
          </details>
          <div className="flex flex-wrap gap-2">
            <a
              href={outlook}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Abrir no Outlook
            </a>
            <a href={mailto} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary">
              Outlook do computador
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${assunto}\n\n${texto}`);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                } catch {
                  setCopiado(false);
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary"
            >
              {copiado ? "✅ Copiado" : "📋 Copiar"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Quer o PDF junto? Baixe em PDF e anexe no e-mail.</p>
        </div>
      )}
    </div>
  );
}
