"use client";

import Link from "next/link";

/**
 * Rede caiu, consulta falhou, qualquer coisa: o colaborador vê uma mensagem
 * clara e um botão para tentar de novo, em vez de uma tela em branco.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-4xl">😕</p>
        <h1 className="mt-3 text-lg font-bold text-slate-900">
          Não conseguimos carregar esta tela
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Pode ter sido a internet. Tente novamente — se continuar, avise seu
          gestor.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Voltar ao menu
          </Link>
        </div>

        {/* Recolhido para não assustar o colaborador, mas disponível: sem o
            texto do erro fica impossível descobrir o que aconteceu. */}
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-xs text-slate-400">
            Detalhes técnicos
          </summary>
          <p className="mt-2 break-words rounded-lg bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-600">
            {error.message || "sem mensagem"}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </details>
      </div>
    </div>
  );
}
