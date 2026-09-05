import Link from "next/link";
import type { Painel } from "@/lib/gestao";
import type { SinalDoPainel } from "@/lib/gestao-server";

/**
 * O cartão de uma análise da Gestão.
 *
 * Vive fora das duas telas que o usam -- a home e o /gestao -- porque
 * agora são duas: desde 05/09/2026 quem tem acesso vê as análises na
 * PRÓPRIA home, sem atravessar o Modo Liderança. Duas cópias do mesmo
 * cartão seriam duas telas divergindo na primeira mudança de rótulo.
 *
 * O SINAL É O QUE FAZ O CARTÃO VALER. "Anomalias" sozinho obriga a abrir
 * para descobrir se há algo; "Anomalias · 3 esperando" decide por fora --
 * e mostra o que existe para quem não ia procurar. Só painel de pendência
 * tem sinal (ver sinaisDosPaineis): número enfeite ao lado de um alerta de
 * verdade estraga os dois.
 */
export function CartaoDePainel({
  painel,
  sinal,
}: {
  painel: Painel;
  sinal?: SinalDoPainel;
}) {
  const urgente = Boolean(sinal);

  return (
    <Link
      href={painel.href}
      className={`group flex min-w-0 items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        urgente
          ? "border-red-200 hover:border-red-400"
          : "border-slate-200 hover:border-primary"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-colors ${
          urgente ? "bg-red-50" : "bg-slate-100 group-hover:bg-primary-soft"
        }`}
      >
        {painel.emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
          <span className="truncate">{painel.rotulo}</span>
          {/* Estes continuam morando no app do colaborador -- quem opera os
              usa todo dia. A seta avisa que o clique sai desta área, para a
              troca de barra não parecer defeito. */}
          {!painel.mora && (
            <span className="shrink-0 text-xs font-normal text-slate-400" title="Abre no app">
              ↗
            </span>
          )}
        </span>

        {sinal ? (
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold leading-none text-red-700 tabular-nums">
              {sinal.valor}
            </span>
            <span className="text-sm font-medium text-red-700">{sinal.rotulo}</span>
          </span>
        ) : (
          /* A pergunta é o que separa um cartão do outro. Seis nomes
             parecidos obrigariam a abrir para descobrir. */
          <span className="mt-0.5 block text-sm text-slate-500">{painel.pergunta}</span>
        )}
      </span>

      {/* A seta que anda no hover: no desktop diz que o cartão inteiro é
          clicável, e não só o título. Escondida no toque, onde não há
          hover para revelá-la. */}
      <span
        aria-hidden="true"
        className="hidden shrink-0 self-center text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:block"
      >
        →
      </span>
    </Link>
  );
}
