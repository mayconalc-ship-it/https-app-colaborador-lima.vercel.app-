"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { concluirBlitz } from "./actions";
import { ItemDaBlitz, type ItemChecklist, type RespostaGravada } from "./ItemDaBlitz";

export type GrupoDoChecklist = { nome: string; itens: ItemChecklist[] };

/**
 * O CHECKLIST INTEIRO, do lado do cliente -- para a tela andar no ritmo do
 * dedo, não no da doca.
 *
 * Pedido do dono (07/09/2026): "no módulo da blitz deixe mais rápido a
 * flutuação dos botões, OK NOK e N/A". O botão já pintava na hora; o que
 * demorava era TUDO O MAIS. Cada resposta revalida a página no servidor, e
 * enquanto essa volta não chegava o contador dizia o número velho, o botão
 * de concluir continuava desligado e os três botões ficavam desabilitados
 * -- de modo que o item seguinte não aceitava toque. Treze itens vezes uma
 * volta de rede na doca é a lentidão inteira.
 *
 * Aqui as respostas viram estado da tela. O contador, o "faltam N" e o
 * botão de concluir leem esse estado, então mudam no toque. A gravação
 * continua indo ao servidor por trás, no seu tempo.
 *
 * O SERVIDOR CONTINUA MANDANDO NO QUE ESTÁ GRAVADO: o que vale é
 * `{ ...do servidor, ...o que a pessoa acabou de tocar }`. O toque vence
 * porque é mais novo; tudo o que a tela não tocou -- um NOK gravado com
 * foto, uma resposta de outra aba -- vem do banco como sempre.
 */
export function ChecklistDaBlitz({
  grupos,
  gravadas,
  atendimentoId,
  blitzId,
  fechada,
}: {
  grupos: GrupoDoChecklist[];
  gravadas: Record<string, RespostaGravada>;
  atendimentoId: string;
  blitzId: string;
  fechada: boolean;
}) {
  const [tocadas, setTocadas] = useState<Record<string, "ok" | "nok" | "na">>({});

  const itens = grupos.flatMap((g) => g.itens);
  const respostaDe = (itemId: string) => tocadas[itemId] ?? gravadas[itemId]?.resposta ?? null;

  const respondidos = itens.filter((i) => respostaDe(i.id) !== null).length;
  const nok = itens.filter((i) => respostaDe(i.id) === "nok").length;
  const falta = itens.length - respondidos;

  return (
    <>
      {!fechada && (
        /* O CONTADOR FICA GRUDADO NO TOPO. Na doca a pessoa rola muito, e
           "faltam 4" é a única informação que ela procura o tempo todo. */
        <div className="sticky top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
          <span className="font-semibold text-slate-700">
            {respondidos} de {itens.length} respondidos
          </span>
          <span className={nok > 0 ? "font-bold text-red-700" : "text-slate-500"}>{nok} NOK</span>
        </div>
      )}

      <div className="space-y-5">
        {grupos.map((g) => (
          <section key={g.nome}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {g.nome}
            </h2>
            <ul className="space-y-2">
              {g.itens.map((item) => (
                <ItemDaBlitz
                  key={item.id}
                  item={item}
                  gravada={gravadas[item.id] ?? null}
                  escolha={tocadas[item.id] ?? null}
                  aoEscolher={(valor) => setTocadas((antes) => ({ ...antes, [item.id]: valor }))}
                  atendimentoId={atendimentoId}
                  blitzId={blitzId}
                  somenteLeitura={fechada}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!fechada && itens.length > 0 && (
        <form action={concluirBlitz} className="sticky bottom-4 z-10 mt-5">
          <input type="hidden" name="atendimento_id" value={atendimentoId} />
          <input type="hidden" name="blitz_id" value={blitzId} />
          {/* O botão só liga com o checklist inteiro respondido, e diz o que
              falta. A ação de servidor recusa igual -- botão escondido não é
              regra, é cortesia. Ligar pelo estado da tela, e não pela volta
              do servidor, é o que faz o último OK liberar o concluir no
              mesmo toque. */}
          <BotaoEnviar
            textoEnviando="Concluindo..."
            disabled={falta > 0}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
          >
            {falta > 0
              ? `Falta${falta === 1 ? "" : "m"} ${falta} item(ns) para concluir`
              : `Concluir blitz${nok > 0 ? ` — ${nok} NOK` : " — tudo OK"}`}
          </BotaoEnviar>
        </form>
      )}
    </>
  );
}
