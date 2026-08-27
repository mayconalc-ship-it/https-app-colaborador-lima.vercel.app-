/**
 * O "+" quadrado azul -- padrão único de "adicionar" no app inteiro
 * (pedido do dono, 27/08/2026, a partir do botão de cadastrar motorista
 * na Portaria). Fonte única do visual: quem precisar de um "adicionar"
 * novo usa daqui, em vez de inventar outro botão.
 *
 * Duas formas, mesma identidade:
 * - CLASSE_MAIS: só o quadradinho azul, para colar dentro de um campo
 *   (ver ComboboxNome) -- ali o rótulo do campo já diz o que se cadastra.
 * - BotaoAdicionarLinha: o mesmo quadradinho COM o texto ao lado, para os
 *   botões que acrescentam mais uma linha ao formulário. O rótulo fica
 *   visível de propósito: "adicionar produto" e "adicionar NF" são coisas
 *   diferentes na mesma tela, e no celular o ícone sozinho não diria qual.
 */

/** O quadradinho azul do "+". Combine com uma altura (ex: `h-7`). */
export const CLASSE_MAIS =
  "flex aspect-square items-center justify-center rounded-lg bg-primary text-lg font-bold leading-none text-white";

export function BotaoAdicionarLinha({
  onClick,
  children,
  className = "",
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-primary-dark hover:bg-primary-soft ${className}`}
    >
      <span className={`${CLASSE_MAIS} h-7`} aria-hidden="true">
        +
      </span>
      {children}
    </button>
  );
}
