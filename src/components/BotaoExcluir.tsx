"use client";

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormNoLugar } from "@/components/FormNoLugar";
import type { ResultadoAcao } from "@/lib/resultado-acao";

/**
 * O botão passa por `BotaoEnviar` para ganhar rodinha e travar sozinho --
 * sem retorno nenhum, quem tocou fica olhando para um botão parado e toca
 * de novo. A pergunta de confirmação é a do FormNoLugar.
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
  title,
}: {
  /** Ação antiga (redireciona) ou nova (devolve o resultado e fica no lugar). */
  action: (formData: FormData) => void | Promise<void | ResultadoAcao>;
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
  title?: string;
}) {
  // FormNoLugar por dentro (03/10/2026): a ação que devolve o resultado
  // fica no lugar, com o aviso no rodapé; a antiga continua navegando.
  return (
    <FormNoLugar
      acao={async (fd) => (await action(fd)) ?? undefined}
      confirmacao={{ titulo: confirmacao, confirmar: rotuloConfirmar, perigo }}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        textoEnviando={textoEnviando}
        title={title}
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
