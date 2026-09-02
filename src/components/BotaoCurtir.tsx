"use client";

import { useState, useTransition } from "react";
import { alternarCurtida } from "@/app/comunicados/actions";
import { resumirNomes } from "@/lib/nomes";

/**
 * Curtir, e ver quem curtiu -- pedido do dono em 03/09/2026, "como se
 * fosse em rede social".
 *
 * Os nomes moram AQUI dentro, junto do estado da curtida, e não num
 * componente ao lado. É o que impede o defeito clássico: eu curto, o
 * contador vira 13 na hora (é otimista, a rede do armazém oscila) e a
 * lista continua com 12 nomes, sem o meu, até alguém recarregar a página.
 *
 * Do servidor vêm só os OUTROS. O meu nome entra localmente como "Você",
 * a partir do mesmo estado que pinta o coração -- então lista e contador
 * nunca discordam, nem no meio segundo em que a rede ainda não respondeu.
 */
export function BotaoCurtir({
  comunicadoId,
  curtidoInicial,
  totalInicial,
  outrosNomes,
}: {
  comunicadoId: number;
  curtidoInicial: boolean;
  /**
   * O total de curtidas contado nas LINHAS do banco -- a verdade.
   *
   * Cheguei a derivar o contador da lista de nomes ("assim eles nunca
   * discordam") e foi um tiro no pé: os nomes dependem de uma segunda
   * consulta, e quando ela voltou vazia um post com 15 curtidas mostrou
   * 1. A curtida é o fato; o nome é um enfeite que pode faltar.
   */
  totalInicial: number;
  /** Quem curtiu, MENOS eu. Já vem resumido ("Jorge Matos") do servidor. */
  outrosNomes: string[];
}) {
  const [curtido, setCurtido] = useState(curtidoInicial);
  const [total, setTotal] = useState(totalInicial);
  const [abertaLista, setAbertaLista] = useState(false);
  const [pendente, startTransition] = useTransition();

  // "Você" na frente, como em qualquer rede social: a primeira coisa que
  // a pessoa procura na lista é ela mesma.
  const nomes = curtido ? ["Você", ...outrosNomes] : outrosNomes;

  // Quantas curtidas existem sem nome conhecido (cadastro apagado, por
  // exemplo). A lista mostra isso em vez de fingir que a conta fecha --
  // uma lista com 12 nomes sob um contador de 15 faz a pessoa achar que
  // o app perdeu alguém.
  const semNome = Math.max(0, total - nomes.length);

  function handleClick() {
    // Muda na hora e desfaz se o servidor recusar: no celular do motorista a
    // rede oscila, e esperar a resposta daria a impressao de travamento.
    const eraCurtido = curtido;
    setCurtido(!eraCurtido);
    setTotal((n) => (eraCurtido ? Math.max(0, n - 1) : n + 1));

    startTransition(async () => {
      const r = await alternarCurtida(comunicadoId, eraCurtido);
      if (!r.ok) {
        setCurtido(eraCurtido);
        setTotal((n) => (eraCurtido ? n + 1 : Math.max(0, n - 1)));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pendente}
        aria-pressed={curtido}
        aria-label={curtido ? "Remover curtida" : "Curtir"}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
          curtido
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-slate-200 text-slate-500 hover:bg-slate-50"
        }`}
      >
        <span className="text-base">{curtido ? "❤️" : "🤍"}</span>
        {total > 0 && <span>{total}</span>}
        <span className={total > 0 ? "sr-only" : ""}>Curtir</span>
      </button>

      {/* A legenda é o atalho: dois nomes já respondem "quem viu isso?".
          O toque abre a lista inteira, para quem quer conferir. Botão
          separado do coração de propósito -- juntar os dois faria quem
          quisesse só espiar acabar curtindo sem querer. */}
      {total > 0 && (
        <button
          type="button"
          onClick={() => setAbertaLista(true)}
          className="min-w-0 flex-1 truncate text-left text-xs text-slate-500 hover:text-primary hover:underline"
        >
          {nomes.length > 0
            ? `${resumirNomes(nomes)} ${total === 1 ? "curtiu" : "curtiram"}`
            : `Ver quem curtiu (${total})`}
        </button>
      )}

      {abertaLista && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quem curtiu esta publicação"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center"
          onClick={() => setAbertaLista(false)}
        >
          {/* Sobe de baixo no celular (é onde o polegar está) e fica
              centrada no computador. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">
                ❤️ Curtiram
                <span className="ml-2 font-normal tabular-nums text-slate-400">{total}</span>
              </h2>
              <button
                type="button"
                onClick={() => setAbertaLista(false)}
                aria-label="Fechar"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {nomes.map((n, i) => (
                <li key={`${n}-${i}`} className="flex items-center gap-3 py-2.5">
                  {/* A inicial no círculo faz a lista ser varrida com o
                      olho, em vez de lida linha a linha. */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-dark">
                    {n.charAt(0).toLocaleUpperCase("pt-BR")}
                  </span>
                  <span className={`min-w-0 truncate text-sm ${n === "Você" ? "font-semibold text-primary-dark" : "text-slate-700"}`}>
                    {n}
                  </span>
                </li>
              ))}
              {semNome > 0 && (
                <li className="py-2.5 text-sm text-slate-400">
                  e mais {semNome} pessoa{semNome === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
