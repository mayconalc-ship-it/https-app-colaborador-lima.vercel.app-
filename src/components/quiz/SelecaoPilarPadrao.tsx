"use client";

import { useState } from "react";

type Padrao = { id: number; nome: string; pilar: string | null };

const ENTRADA =
  "w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none";

/**
 * PILAR E PADRÃO, LIGADOS -- pedido do dono (05/09/2026): "ao selecionar
 * o pilar nas configurações, trazer somente os padrões referente aquele
 * pilar selecionado, hoje essa informação do pilar não faz sentido".
 *
 * Eram dois selects independentes, e o do padrão listava o acervo
 * inteiro com o pilar escrito no rótulo ("Segurança · Carregamento").
 * Escolher o pilar não mudava nada -- e nada impedia uma rodada de
 * pilar A com padrão de pilar B, que é uma contradição que nenhuma tela
 * depois consegue explicar.
 *
 * Agora o pilar FILTRA. Trocar o pilar limpa o padrão escolhido, porque
 * manter um padrão de outro pilar selecionado é exatamente a
 * contradição que este componente existe para impedir.
 *
 * PADRÃO SEM PILAR CADASTRADO CONTINUA APARECENDO, em um grupo separado
 * no fim: o acervo tem documentos antigos sem pilar preenchido, e
 * escondê-los faria a lista parecer vazia para quem escolheu um pilar
 * qualquer -- o remédio seria pior que a doença.
 */
export function SelecaoPilarPadrao({
  pilares,
  padroes,
  pilarInicial = "",
  padraoInicial = "",
  idPilar = "pilar",
  idPadrao = "padrao_id",
}: {
  pilares: { id: number | string; nome: string }[];
  padroes: Padrao[];
  pilarInicial?: string;
  padraoInicial?: string;
  idPilar?: string;
  idPadrao?: string;
}) {
  const [pilar, setPilar] = useState(pilarInicial);
  const [padraoId, setPadraoId] = useState(padraoInicial);

  const semPilar = padroes.filter((p) => !p.pilar?.trim());
  const doPilar = pilar
    ? padroes.filter((p) => (p.pilar ?? "").trim() === pilar)
    : padroes.filter((p) => p.pilar?.trim());

  function trocarPilar(novo: string) {
    setPilar(novo);
    // O padrão escolhido só sobrevive se pertencer ao pilar novo.
    const atual = padroes.find((p) => String(p.id) === padraoId);
    const continua =
      !atual || !novo || !atual.pilar?.trim() || atual.pilar.trim() === novo;
    if (!continua) setPadraoId("");
  }

  return (
    <>
      <div>
        <label
          className="mb-1 block text-xs font-medium text-slate-600"
          htmlFor={idPilar}
        >
          Pilar
        </label>
        <select
          id={idPilar}
          name="pilar"
          value={pilar}
          onChange={(e) => trocarPilar(e.target.value)}
          className={ENTRADA}
        >
          <option value="">— todos os pilares —</option>
          {pilares.map((p) => (
            <option key={p.id} value={p.nome}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-slate-600"
          htmlFor={idPadrao}
        >
          Padrão
        </label>
        <select
          id={idPadrao}
          name="padrao_id"
          value={padraoId}
          onChange={(e) => setPadraoId(e.target.value)}
          className={ENTRADA}
        >
          <option value="">— nenhum —</option>
          {doPilar.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
          {/* Os sem pilar ficam num grupo à parte, e rotulado: assim
              quem escolhe um deles sabe que está saindo do filtro, em
              vez de achar que o padrão pertence ao pilar selecionado. */}
          {semPilar.length > 0 && (
            <optgroup label="Sem pilar cadastrado">
              {semPilar.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {pilar
            ? doPilar.length === 0
              ? `Nenhum padrão cadastrado no pilar ${pilar}. Escolha outro pilar, ou um dos "sem pilar".`
              : `${doPilar.length} padrão(ões) do pilar ${pilar}. É dele que as perguntas saem.`
            : "Escolha o pilar para ver só os padrões dele."}
        </p>
      </div>
    </>
  );
}
