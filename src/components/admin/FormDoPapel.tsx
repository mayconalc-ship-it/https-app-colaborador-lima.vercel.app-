"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

/**
 * TORNAR OU TIRAR A LIDERANÇA, sempre com confirmação.
 *
 * Relato do dono (11/09/2026): em Acessos por Pessoa, a Lais virou
 * liderança num toque -- sem a caixa vermelha que os Perfis já exigiam e
 * sem pergunta nenhuma; tirar também não perguntava. Mesmo papel, duas
 * portas, só uma trancada.
 *
 * - TORNAR: a caixa vermelha (o botão só liga com ela marcada) e depois a
 *   pergunta. O servidor recusa sem `tornar_lideranca`.
 * - TIRAR: a pergunta, dizendo o que se perde. O servidor recusa sem
 *   `confirmado`, que só este formulário manda.
 */
export function FormDoPapel({
  action,
  id,
  nome,
  papel,
  revendaId,
  className,
}: {
  action: (formData: FormData) => void;
  id: string;
  nome: string;
  /** O papel que a pessoa vai PASSAR a ter. */
  papel: "lideranca" | "colaborador";
  revendaId: string;
  className?: string;
}) {
  const [marcou, setMarcou] = useState(false);
  const confirmarEnvio = useConfirmarEnvio();
  const primeiroNome = nome.split(" ")[0] || nome;
  const tornar = papel === "lideranca";

  return (
    <form
      action={action}
      onSubmit={confirmarEnvio(
        tornar
          ? {
              titulo: `Tornar ${nome} liderança?`,
              detalhe: `${primeiroNome} passa a entrar no Modo Liderança. Entra sem nenhuma permissão: o que ele vê e faz lá dentro você libera na ficha, logo depois.`,
              confirmar: "Tornar liderança",
            }
          : {
              titulo: `Tirar a liderança de ${nome}?`,
              detalhe: `${primeiroNome} continua usando o app, mas sai do Modo Liderança e perde TODAS as permissões de liderança, em todas as revendas. Para voltar, é preciso liberar tudo de novo.`,
              confirmar: "Tirar liderança",
            },
      )}
      className={className}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="revenda" value={revendaId} />
      <input type="hidden" name="confirmado" value="sim" />

      {tornar ? (
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] leading-snug text-red-900">
            <input
              type="checkbox"
              name="tornar_lideranca"
              checked={marcou}
              onChange={(e) => setMarcou(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Confirmo que {primeiroNome} passa a <strong>entrar no Modo Liderança</strong>. Se a
              ideia era só liberar um módulo do app, use a aba Módulos ou um perfil 📱 Colaborador.
            </span>
          </label>
          <BotaoEnviar
            textoEnviando="Aplicando..."
            disabled={!marcou}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Tornar liderança
          </BotaoEnviar>
        </div>
      ) : (
        <>
          <BotaoEnviar
            textoEnviando="Removendo..."
            className="w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Remover a liderança de {primeiroNome}
          </BotaoEnviar>
          <p className="mt-2 text-xs text-slate-400">
            A pessoa continua usando o app normalmente. Só perde o acesso ao Modo Liderança e todas
            as permissões.
          </p>
        </>
      )}
    </form>
  );
}
