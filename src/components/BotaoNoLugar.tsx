"use client";

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormNoLugar } from "@/components/FormNoLugar";
import type { ResultadoAcao } from "@/lib/resultado-acao";

/**
 * Um botão que dispara uma ação e fica onde está -- o BotaoExcluir, mas
 * sem a navegação de volta ao topo. A pergunta de confirmação continua
 * (é a mesma caixa do resto do app); o resultado sai no aviso do rodapé.
 */
export function BotaoNoLugar({
  acao,
  campos,
  confirmacao,
  rotuloConfirmar,
  detalhe,
  perigo = true,
  children,
  className,
  textoEnviando = "Aguarde...",
  title,
  disabled,
}: {
  acao: (formData: FormData) => Promise<ResultadoAcao>;
  campos: Record<string, string | number>;
  /** A pergunta. Sem ela, o botão age direto (o "Trazer" do banco). */
  confirmacao?: string;
  rotuloConfirmar?: string;
  detalhe?: string;
  perigo?: boolean;
  children: React.ReactNode;
  className?: string;
  textoEnviando?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <FormNoLugar
      acao={acao}
      confirmacao={
        confirmacao ? { titulo: confirmacao, detalhe, confirmar: rotuloConfirmar, perigo } : undefined
      }
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        textoEnviando={textoEnviando}
        title={title}
        disabled={disabled}
        className={
          className ??
          "rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        }
      >
        {children}
      </BotaoEnviar>
    </FormNoLugar>
  );
}
