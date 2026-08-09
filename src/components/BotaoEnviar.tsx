"use client";

import { useFormStatus } from "react-dom";

/**
 * Botão de submit que se desliga sozinho enquanto a ação roda.
 *
 * Sem isso, uma ação lenta (upload, leitura de planilha) convida a pessoa a
 * clicar de novo por impaciência -- e cada clique é uma submissão nova.
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
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? textoEnviando : children}
    </button>
  );
}
