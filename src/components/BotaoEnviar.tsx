"use client";

import { useFormStatus } from "react-dom";

/**
 * Botão de submit que se desliga sozinho enquanto a ação roda.
 *
 * Sem isso, uma ação lenta (upload, leitura de planilha) convida a pessoa a
 * clicar de novo por impaciência -- e cada clique é uma submissão nova.
 *
 * Além de desligar, mostra uma rodinha: só o texto trocando para
 * "Enviando..." dá pouca certeza de que ainda está andando quando a espera
 * passa de alguns segundos.
 */
export function BotaoEnviar({
  children,
  textoEnviando = "Enviando...",
  className,
}: {
  children: React.ReactNode;
  textoEnviando?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="rodinha" aria-hidden="true" />
          {textoEnviando}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
