"use client";

import { useFormStatus } from "react-dom";

/**
 * Botão de submit que se desliga sozinho enquanto a ação roda.
 *
 * Sem isso, uma ação lenta (upload, leitura de planilha) convida a pessoa a
 * clicar de novo por impaciência -- e cada clique é uma submissão nova.
 *
 * Além de desligar, mostra uma rodinha: só o texto trocando para
 * "Enviando..." dá pouca certeza de que ainda está andando quando a espera
 * passa de alguns segundos.
 *
 * `compacto` existe para os botões que são um ícone só (as setas de ordenar,
 * por exemplo): trocar "↑" por "Enviando..." estouraria a largura da linha,
 * então ali fica só a rodinha no lugar do ícone.
 *
 * `disabled` é repassado porque vários desses botões já nasciam desligados
 * por conta própria (a seta "para cima" do primeiro item da lista). Sem
 * repassar, envolver o botão neste componente reativaria o que estava
 * desligado de propósito.
 */
export function BotaoEnviar({
  children,
  textoEnviando = "Enviando...",
  className,
  disabled = false,
  compacto = false,
  ariaLabel,
  title,
}: {
  children: React.ReactNode;
  textoEnviando?: string;
  className?: string;
  disabled?: boolean;
  compacto?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      title={title}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (
        compacto ? (
          <span className="rodinha" aria-hidden="true" />
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="rodinha" aria-hidden="true" />
            {textoEnviando}
          </span>
        )
      ) : (
        children
      )}
    </button>
  );
}
