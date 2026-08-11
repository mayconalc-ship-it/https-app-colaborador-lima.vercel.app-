"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Confirmação de ação destrutiva.
 *
 * Substitui o confirm() do navegador, que tinha três problemas num app
 * usado no celular: aparece com a cara do sistema (e no Android mostra a
 * URL, o que parece golpe), trava a página inteira, e o botão "OK" fica
 * do lado onde o polegar já estava indo — excluir por engano era fácil.
 *
 * Aqui a ação destrutiva é vermelha e fica SEPARADA do "Cancelar", que é
 * o botão largo. Quem só quer sair do caminho acerta sem mirar.
 */

type Pedido = {
  titulo: string;
  detalhe?: string;
  confirmar?: string;
  perigo?: boolean;
};

type Pendente = Pedido & { resolver: (ok: boolean) => void };

const ConfirmacaoContext = createContext<
  ((pedido: Pedido) => Promise<boolean>) | null
>(null);

export function ConfirmacaoProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendente, setPendente] = useState<Pendente | null>(null);

  const perguntar = useCallback(
    (pedido: Pedido) =>
      new Promise<boolean>((resolver) => {
        setPendente({ ...pedido, resolver });
      }),
    [],
  );

  const responder = useCallback(
    (ok: boolean) => {
      setPendente((atual) => {
        atual?.resolver(ok);
        return null;
      });
    },
    [],
  );

  // Esc cancela. Quem usa teclado (o Admin, no computador) espera isso.
  useEffect(() => {
    if (!pendente) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") responder(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pendente, responder]);

  return (
    <ConfirmacaoContext.Provider value={perguntar}>
      {children}
      {pendente && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmacao-titulo"
          onClick={() => responder(false)}
        >
          <div
            className="toast-entra w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirmacao-titulo"
              className="text-base font-bold text-slate-900"
            >
              {pendente.titulo}
            </h2>
            {pendente.detalhe && (
              <p className="mt-1 text-sm text-slate-500">{pendente.detalhe}</p>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => responder(true)}
                className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${
                  pendente.perigo === false ? "bg-primary" : "bg-red-600"
                }`}
              >
                {pendente.confirmar ?? "Excluir"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => responder(false)}
                className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmacaoContext.Provider>
  );
}

/**
 * Fora do provider volta ao confirm() do navegador em vez de deixar
 * passar: uma exclusão sem pergunta nenhuma seria pior que um popup feio.
 */
export function useConfirmacao() {
  const ctx = useContext(ConfirmacaoContext);
  return (
    ctx ??
    ((pedido: Pedido) =>
      Promise.resolve(
        window.confirm(
          pedido.detalhe ? `${pedido.titulo}\n\n${pedido.detalhe}` : pedido.titulo,
        ),
      ))
  );
}

/**
 * Cola pronta para os formulários que só existem para excluir algo.
 *
 * O envio precisa ser barrado (a resposta da pessoa vem depois, e um
 * `onSubmit` não sabe esperar promessa), e depois reenviado à mão. O ref
 * evita o laço infinito: no segundo envio já passa direto.
 */
export function useConfirmarEnvio() {
  const confirmar = useConfirmacao();
  const liberado = useRef(false);

  return (pedido: Pedido) => (e: React.FormEvent<HTMLFormElement>) => {
    if (liberado.current) {
      liberado.current = false;
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    void confirmar(pedido).then((ok) => {
      if (!ok) return;
      liberado.current = true;
      form.requestSubmit();
    });
  };
}
