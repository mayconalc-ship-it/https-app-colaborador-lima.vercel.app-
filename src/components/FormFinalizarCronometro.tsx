"use client";

import { useConfirmacao } from "@/components/Confirmacao";
import { FormNoLugar } from "@/components/FormNoLugar";
import type { ResultadoAcao } from "@/lib/resultado-acao";
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
 * Sobre o FormNoLugar (03/10/2026): finalizar não sobe a tela, e a
 * pergunta do "durou só X segundos" é o `antesDeEnviar` dele.
 */
export function FormFinalizarCronometro({
  action,
  inicio,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void | ResultadoAcao>;
  inicio: string;
  className?: string;
  children: React.ReactNode;
}) {
  const confirmar = useConfirmacao();

  async function antesDeEnviar(form: HTMLFormElement) {
    const campo = form.elements.namedItem(CAMPO_CONFIRMA_CURTO) as HTMLInputElement | null;
    if (campo) campo.value = "";
    const segundos = segundosDesde(inicio);
    if (segundos >= DURACAO_MINIMA_SEGUNDOS) return true;
    const ok = await confirmar({
      titulo: `Durou só ${segundos} segundo${segundos === 1 ? "" : "s"}?`,
      detalhe:
        "O tempo conta do Iniciar ao Finalizar. Se o trabalho já tinha acabado quando você " +
        "iniciou, o indicador vai registrar só segundos. Da próxima vez, inicie quando " +
        "começar e finalize quando terminar.",
      confirmar: "Finalizar mesmo assim",
      perigo: false,
    });
    if (ok && campo) campo.value = "1";
    return ok;
  }

  return (
    <FormNoLugar acao={async (fd) => (await action(fd)) ?? undefined} antesDeEnviar={antesDeEnviar} className={className}>
      <input type="hidden" name={CAMPO_CONFIRMA_CURTO} defaultValue="" />
      {children}
    </FormNoLugar>
  );
}
