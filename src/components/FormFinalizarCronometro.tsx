"use client";

import { useRef } from "react";
import { useConfirmacao } from "@/components/Confirmacao";
import {
  CAMPO_CONFIRMA_CURTO,
  DURACAO_MINIMA_SEGUNDOS,
  segundosDesde,
} from "@/lib/duracao-lancamento";

/**
 * O formulário de FINALIZAR dos cronômetros do armazém (bancada, despejo,
 * abastecimento). Igual a um <form> comum, com uma pergunta a mais: se o
 * lançamento durou menos de 1 minuto, confirma antes de enviar -- ver
 * lib/duracao-lancamento.ts. Confirmado, vai junto o campo que o servidor
 * exige para aceitar um lançamento curto.
 *
 * Mesmo desenho de useConfirmarEnvio (Confirmacao.tsx): o envio é barrado,
 * a resposta vem depois, e o reenvio passa direto pelo ref.
 */
export function FormFinalizarCronometro({
  action,
  inicio,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  inicio: string;
  className?: string;
  children: React.ReactNode;
}) {
  const confirmar = useConfirmacao();
  const liberado = useRef(false);
  const campo = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (liberado.current) {
          liberado.current = false;
          return;
        }
        const segundos = segundosDesde(inicio);
        if (segundos >= DURACAO_MINIMA_SEGUNDOS) return;
        e.preventDefault();
        const form = e.currentTarget;
        void confirmar({
          titulo: `Durou só ${segundos} segundo${segundos === 1 ? "" : "s"}?`,
          detalhe:
            "O tempo conta do Iniciar ao Finalizar. Se o trabalho já tinha acabado quando você " +
            "iniciou, o indicador vai registrar só segundos. Da próxima vez, inicie quando " +
            "começar e finalize quando terminar.",
          confirmar: "Finalizar mesmo assim",
          perigo: false,
        }).then((ok) => {
          if (!ok) return;
          if (campo.current) campo.current.value = "1";
          liberado.current = true;
          form.requestSubmit();
        });
      }}
    >
      <input ref={campo} type="hidden" name={CAMPO_CONFIRMA_CURTO} defaultValue="" />
      {children}
    </form>
  );
}
