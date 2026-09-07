"use client";

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

/**
 * O BOTÃO QUE MOVE A CARRETA DE ETAPA.
 *
 * Pedido do dono (07/09/2026): "deixe o botão após clicar em iniciar
 * descarga para uma cor mais chamativa em todas as ações, com o aviso se
 * tem certeza da confirmação".
 *
 * TODA ETAPA DESTE MÓDULO É IRREVERSÍVEL NA PRÁTICA. Iniciar a descarga
 * grava o horário que entra no TMA; finalizar fecha a janela em que ainda
 * dava para fotografar a carga. Não existe "desfazer" para o conferente --
 * o desfazer é pedir para a liderança corrigir. Um toque errado no celular,
 * de luva, na doca, custa uma correção manual e um número torto no
 * indicador. Por isso todas passam a perguntar antes.
 *
 * A COR DIZ O QUE VAI ACONTECER, e é essa a razão de haver dois tons:
 * âmbar COMEÇA alguma coisa, verde ENCERRA. Um botão azul para as duas
 * faz o dedo decidir pela posição, e a posição muda conforme a tela.
 *
 * A pergunta não atrapalha o "carregando": `useConfirmarEnvio` barra o
 * primeiro envio e reenvia depois do sim -- é o segundo, o de verdade, que
 * o botão enxerga para travar sozinho.
 */
export type TomDaEtapa = "comecar" | "encerrar";

const TONS: Record<TomDaEtapa, string> = {
  // Âmbar forte: chama o olho sem ser o vermelho de perigo -- começar uma
  // etapa não é destruir nada.
  comecar:
    "bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700",
  // Verde: a etapa fecha aqui.
  encerrar:
    "bg-green-600 text-white shadow-sm hover:bg-green-700 active:bg-green-800",
};

export function BotaoDeEtapa({
  action,
  campos,
  titulo,
  detalhe,
  confirmar,
  textoEnviando,
  tom,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Os campos escondidos do formulário (atendimento_id, normalmente). */
  campos: Record<string, string>;
  /** A pergunta, curta, no topo da caixa. */
  titulo: string;
  /** O que muda ao confirmar -- é isto que evita o toque por engano. */
  detalhe: string;
  /** O texto do botão que confirma. */
  confirmar: string;
  textoEnviando: string;
  tom: TomDaEtapa;
  children: React.ReactNode;
}) {
  const aoEnviar = useConfirmarEnvio();

  return (
    <form
      action={action}
      onSubmit={aoEnviar({
        titulo,
        detalhe,
        confirmar,
        // `perigo: false` deixa o botão de confirmar azul em vez de
        // vermelho. Vermelho aqui assustaria à toa e sugeriria perda de
        // dado, que não é o caso: a etapa avança, não apaga.
        perigo: false,
      })}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        textoEnviando={textoEnviando}
        className={`w-full rounded-xl px-4 py-3.5 text-base font-bold ${TONS[tom]}`}
      >
        {children}
      </BotaoEnviar>
    </form>
  );
}
