"use client";

import { useRef } from "react";

/**
 * Checkbox que envia o próprio formulário sozinho, sem botão "Salvar".
 *
 * Feito para tabelas de acesso (linha = pessoa, coluna = módulo): com
 * uma célula por módulo por pessoa, um botão de confirmar em cada uma
 * multiplicaria por dois a quantidade de elementos na tela. O `hidden`
 * carrega o valor de verdade (`"true"`/`"false"`) porque um checkbox
 * desmarcado simplesmente NÃO manda o próprio valor no FormData -- sem
 * o hidden, desligar um acesso e ligar de novo seriam indistinguíveis
 * para a ação de servidor.
 */
export function CheckboxAutoEnvio({
  nome = "ligar",
  marcado,
  ariaLabel,
}: {
  nome?: string;
  marcado: boolean;
  ariaLabel?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input type="hidden" name={nome} ref={hiddenRef} defaultValue={String(marcado)} />
      <input
        type="checkbox"
        defaultChecked={marcado}
        aria-label={ariaLabel}
        className="h-5 w-5 cursor-pointer rounded border-slate-300 text-primary"
        onChange={(e) => {
          if (hiddenRef.current) hiddenRef.current.value = String(e.currentTarget.checked);
          e.currentTarget.form?.requestSubmit();
        }}
      />
    </>
  );
}
