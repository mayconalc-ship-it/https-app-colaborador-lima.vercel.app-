"use client";

import { useState } from "react";

/**
 * O RELATO DE OCORRÊNCIA, pronto para sair.
 *
 * O texto vem escrito do servidor (lib/blitz.ts) e fica EDITÁVEL: quem
 * trata conhece o histórico com aquele transportador e quase sempre tem
 * uma frase a acrescentar. Um texto travado viraria um e-mail que a
 * pessoa reescreve por fora -- e aí o app deixa de ser o registro.
 *
 * DUAS SAÍDAS, porque as caixas de e-mail da operação não são iguais:
 * "Abrir no e-mail" resolve para quem tem cliente configurado; "Copiar"
 * resolve para quem usa o webmail. O app não envia -- montar SMTP daria um
 * remetente genérico, e o rastro que a auditoria quer ver é o da caixa
 * corporativa de quem tratou.
 */
export function RelatoDeOcorrencia({
  assunto,
  textoInicial,
}: {
  assunto: string;
  textoInicial: string;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [copiado, setCopiado] = useState(false);

  const mailto = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de clipboard (acontece em navegador antigo e em
      // http): o texto está na tela, dá para selecionar e copiar à mão.
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Assunto: <strong className="text-slate-700">{assunto}</strong>
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={16}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 focus:border-primary focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={mailto}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ✉️ Abrir no e-mail
        </a>
        <button
          type="button"
          onClick={copiar}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copiado ? "✅ Copiado" : "📋 Copiar o texto"}
        </button>
      </div>
    </div>
  );
}
