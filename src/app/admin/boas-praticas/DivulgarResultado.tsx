"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { MEDALHA, formatarReais, validarPodio } from "@/lib/boas-praticas";
import { divulgarResultado } from "./actions";

type Opcao = { id: string; titulo: string; autor: string; votos: number };

/**
 * O pódio, pronto para divulgar.
 *
 * Vem preenchido com a contagem. A liderança só mexe quando há EMPATE --
 * e mesmo aí o botão só liga com um pódio que o voto sustenta
 * (validarPodio, a mesma função da ação). Antes do dia da divulgação o
 * botão fica desligado com o motivo, que é o mesmo texto que o servidor
 * devolveria.
 */
export function DivulgarResultado({
  votacaoId,
  opcoes,
  sugerido,
  bloqueio,
  premios,
}: {
  votacaoId: string;
  /** Todas as práticas da votação, da mais votada para a menos. */
  opcoes: Opcao[];
  sugerido: string[];
  bloqueio: string | null;
  premios: (number | null)[];
}) {
  const [lugares, setLugares] = useState<string[]>(() => [0, 1, 2].map((i) => sugerido[i] ?? ""));
  const aoEnviar = useConfirmarEnvio();

  const contagem = Object.fromEntries(opcoes.map((o) => [o.id, o.votos]));
  const comVoto = opcoes.filter((o) => o.votos > 0);
  const vagas = Math.min(3, comVoto.length);
  const resultado = validarPodio(contagem, lugares.slice(0, vagas));

  // Há empate que a liderança precisa decidir? Dois vizinhos com o mesmo
  // número de votos dentro do pódio, ou empatados na fronteira dele.
  const empate = comVoto.some((o, i) => i > 0 && i <= vagas && o.votos === comVoto[i - 1].votos);

  const porId = new Map(opcoes.map((o) => [o.id, o]));

  return (
    <form
      action={divulgarResultado}
      onSubmit={aoEnviar({
        titulo: "Divulgar o resultado para a revenda inteira?",
        detalhe: "Todos recebem o aviso com o pódio, e os três premiados recebem um recado pessoal.",
        confirmar: "Divulgar",
        perigo: false,
      })}
      className="space-y-3 rounded-xl bg-amber-50 p-3"
    >
      <input type="hidden" name="id" value={votacaoId} />
      <p className="text-sm font-bold text-amber-900">🏆 Pódio</p>

      {vagas === 0 ? (
        <p className="text-sm text-amber-900">Ninguém votou. Divulgar encerra a votação sem pódio.</p>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: vagas }, (_, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr] items-center gap-2">
              <label htmlFor={`lugar-${i + 1}`} className="text-sm font-semibold text-amber-900">
                {MEDALHA[i]} {i + 1}º
                {premios[i] != null && (
                  <span className="block text-[11px] font-normal">{formatarReais(premios[i])}</span>
                )}
              </label>
              <select
                id={`lugar-${i + 1}`}
                name={`lugar_${i + 1}`}
                value={lugares[i]}
                onChange={(e) =>
                  setLugares((atual) => {
                    const novo = [...atual];
                    novo[i] = e.target.value;
                    return novo;
                  })
                }
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Escolha</option>
                {comVoto.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.titulo} — {o.votos} voto{o.votos === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {empate && (
            <p className="text-xs text-amber-800">
              Há empate. A ordem entre as empatadas é decisão da liderança; o voto continua mandando no resto.
            </p>
          )}
          {!resultado.ok && <p className="text-xs font-semibold text-red-700">{resultado.erro}</p>}
          {resultado.ok && (
            <p className="text-xs text-amber-900">
              {resultado.podio.map((id, i) => `${MEDALHA[i]} ${porId.get(id)?.autor}`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {bloqueio && <p className="text-xs font-semibold text-slate-700">⏳ {bloqueio}</p>}

      <BotaoEnviar
        disabled={Boolean(bloqueio) || !resultado.ok}
        textoEnviando="Divulgando..."
        className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
      >
        🏆 Divulgar o resultado
      </BotaoEnviar>
    </form>
  );
}
