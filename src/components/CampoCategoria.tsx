"use client";

import { useId } from "react";
import { LIMITE_CATEGORIA, type TimeRanking } from "@/lib/ranking-categorias";

// Campo livre com autocompletar. Livre porque a premiacao muda de mes para
// mes; com autocompletar porque "Motorista Sede" precisa sair escrito igual
// todo mes -- e o que ja foi usado antes vem no topo da lista.
export function CampoCategoria({
  time,
  sugestoes,
  defaultValue,
  className,
}: {
  time: TimeRanking;
  sugestoes: Record<TimeRanking, string[]>;
  defaultValue?: string;
  className?: string;
}) {
  const listaId = `${useId()}-categorias`;

  return (
    <>
      <input
        type="text"
        name="categoria"
        list={listaId}
        defaultValue={defaultValue}
        required
        maxLength={LIMITE_CATEGORIA}
        autoComplete="off"
        placeholder="Ex.: Motorista Sede"
        className={className}
      />
      <datalist id={listaId}>
        {(sugestoes[time] ?? []).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
