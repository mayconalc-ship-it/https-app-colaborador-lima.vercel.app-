"use client";

import { useState } from "react";

/**
 * Select alimentado pelos valores já cadastrados, com uma opção "+ Cadastrar
 * novo/nova ..." que troca para um campo de texto livre -- assim dá para
 * reaproveitar o que já existe sem impedir o cadastro de algo novo.
 *
 * Se o valor atual (edição) não estiver na lista -- cadastro antigo, texto
 * livre de antes desta tela existir -- abre já no modo texto, preservando o
 * valor em vez de forçar a pessoa a escolher algo diferente do que já era.
 */
export function CampoComNovaOpcao({
  id,
  name,
  opcoes,
  valorAtual,
  obrigatorio,
  textoNovo,
  placeholderNovo,
  className,
}: {
  id?: string;
  name: string;
  opcoes: string[];
  valorAtual?: string | null;
  obrigatorio?: boolean;
  textoNovo: string;
  placeholderNovo?: string;
  className?: string;
}) {
  const jaNaLista = !!valorAtual && opcoes.includes(valorAtual);
  const eraLivreForaDaLista = !!valorAtual && !jaNaLista;

  const [modo, setModo] = useState<"lista" | "novo">(
    eraLivreForaDaLista ? "novo" : "lista",
  );
  const [valorSelect, setValorSelect] = useState(jaNaLista ? valorAtual! : "");
  const [valorNovo, setValorNovo] = useState(
    eraLivreForaDaLista ? valorAtual! : "",
  );

  return (
    <div>
      <select
        id={id}
        name={name}
        required={obrigatorio && modo === "lista"}
        disabled={modo === "novo"}
        value={valorSelect}
        onChange={(e) => {
          if (e.target.value === "__novo__") setModo("novo");
          else setValorSelect(e.target.value);
        }}
        className={className}
      >
        <option value="" disabled>
          Selecione...
        </option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__novo__">{textoNovo}</option>
      </select>

      {modo === "novo" && (
        <div className="mt-2 flex gap-2">
          <input
            name={name}
            required={obrigatorio}
            value={valorNovo}
            onChange={(e) => setValorNovo(e.target.value)}
            placeholder={placeholderNovo}
            autoFocus
            className={className}
          />
          <button
            type="button"
            onClick={() => setModo("lista")}
            className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
