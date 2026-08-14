"use client";

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

/**
 * O botão passa por `BotaoEnviar` para ganhar rodinha e travar sozinho: a
 * exclusão vai ao servidor e volta com um redirect, e sem retorno nenhum
 * quem tocou fica olhando para um botão parado -- e toca de novo.
 *
 * A confirmação não atrapalha o estado de carregando: `useConfirmarEnvio`
 * barra o PRIMEIRO envio e reenvia depois do "sim", e é esse segundo envio,
 * o de verdade, que o `useFormStatus` enxerga.
 */
export function BotaoExcluir({
  action,
  campos,
  confirmacao,
  children,
  className,
  textoEnviando = "Excluindo...",
  rotuloConfirmar,
  perigo = true,
}: {
  action: (formData: FormData) => void;
  campos: Record<string, string | number>;
  confirmacao: string;
  children: React.ReactNode;
  className?: string;
  textoEnviando?: string;
  /** Texto do botão que confirma. Padrão: "Excluir". */
  rotuloConfirmar?: string;
  /** Falso deixa o botão azul em vez de vermelho, para a ação que exige
   *  confirmação mas não apaga nada (encerrar uma rodada, por exemplo).
   *  Vermelho ali assustaria à toa -- e pior, sugeriria que os resultados
   *  seriam perdidos. */
  perigo?: boolean;
}) {
  const aoEnviar = useConfirmarEnvio();

  return (
    <form
      action={action}
      onSubmit={aoEnviar({
        titulo: confirmacao,
        confirmar: rotuloConfirmar,
        perigo,
      })}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        textoEnviando={textoEnviando}
        className={
          className ??
          "rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        }
      >
        {children}
      </BotaoEnviar>
    </form>
  );
}
