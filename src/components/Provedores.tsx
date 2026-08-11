"use client";

import { ToastProvider } from "@/components/Toast";
import { ConfirmacaoProvider } from "@/components/Confirmacao";

/**
 * Os provedores que envolvem o app inteiro, num lugar só.
 *
 * Existe para o layout não virar uma escada de <Provider> aninhado, que a
 * cada item novo reindenta o cabeçalho inteiro e polui o diff.
 *
 * Ordem: a confirmação fica DENTRO do toast, porque cancelar ou concluir
 * uma ação confirmada normalmente termina em aviso flutuante.
 */
export function Provedores({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmacaoProvider>{children}</ConfirmacaoProvider>
    </ToastProvider>
  );
}
