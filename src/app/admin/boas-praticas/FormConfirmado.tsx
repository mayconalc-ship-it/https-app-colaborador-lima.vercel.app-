"use client";

import { useConfirmarEnvio } from "@/components/Confirmacao";

/**
 * Formulário com campos de verdade (não só ocultos) que pede confirmação
 * antes de enviar -- o BotaoExcluir só leva campos ocultos, e encerrar a
 * votação leva a escolha da vencedora.
 */
export function FormConfirmado({
  action,
  confirmacao,
  detalhe,
  rotuloConfirmar,
  className,
  children,
}: {
  action: (formData: FormData) => void;
  confirmacao: string;
  detalhe?: string;
  rotuloConfirmar?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const aoEnviar = useConfirmarEnvio();
  return (
    <form
      action={action}
      onSubmit={aoEnviar({ titulo: confirmacao, detalhe, confirmar: rotuloConfirmar, perigo: false })}
      className={className}
    >
      {children}
    </form>
  );
}
