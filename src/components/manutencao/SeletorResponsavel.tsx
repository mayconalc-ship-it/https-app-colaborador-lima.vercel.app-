"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type PessoaDaLista = { nome: string; cargo: string | null };

/** Sem acento e em minúsculas: "joao" acha "JOÃO". */
const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Quantos nomes a lista mostra de uma vez -- o resto aparece digitando. */
const MAXIMO = 60;

/**
 * O RESPONSÁVEL DO PLANO DE AÇÃO: lista suspensa com busca pelo nome
 * (pedido do dono, 07/10/2026). Antes era texto livre.
 *
 * O valor só muda ao ESCOLHER um nome da lista. Digitar filtra; sair do
 * campo sem escolher volta ao nome que estava -- assim o plano nunca fica
 * com meio nome digitado.
 *
 * A lista inteira vem pronta do servidor (as pessoas da revenda), e a
 * busca é aqui no celular: no meio do armazém, sem esperar o sinal.
 *
 * ⚠️ Nenhum ancestral pode ter `overflow-hidden` (ver SeletorDePessoa):
 * a lista cai por cima do que vem abaixo e seria cortada sem aviso.
 */
export function SeletorResponsavel({
  valor,
  pessoas,
  aoEscolher,
  className = "",
}: {
  valor: string;
  pessoas: PessoaDaLista[];
  aoEscolher: (nome: string) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const t = chave(termo.trim());
  const achadas = t ? pessoas.filter((p) => chave(p.nome).includes(t)) : pessoas;

  function abrir() {
    setTermo("");
    setAberto(true);
  }

  function escolher(nome: string) {
    aoEscolher(nome);
    setAberto(false);
    setTermo("");
    campo.current?.blur();
  }

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <input
        ref={campo}
        type="text"
        value={aberto ? termo : valor}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={abrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" && achadas.length > 0) {
            e.preventDefault();
            escolher(achadas[0].nome);
          }
          if (e.key === "Escape") setAberto(false);
        }}
        placeholder={aberto && valor ? valor : "Responsável: busque pelo nome"}
        aria-label="Responsável"
        role="combobox"
        aria-controls={idLista}
        aria-expanded={aberto}
        autoComplete="off"
        className="w-full rounded-xl border border-amber-200 bg-white p-2.5 pr-9 text-base focus:border-amber-500 focus:outline-none"
      />
      <ChevronDown
        size={18}
        aria-hidden
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${aberto ? "rotate-180" : ""}`}
      />
      {aberto && (
        <div
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {achadas.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Ninguém da revenda com esse nome.</p>
          ) : (
            <>
              {achadas.slice(0, MAXIMO).map((p, i) => (
                <button
                  key={`${p.nome}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={p.nome === valor}
                  // pointerdown antes do blur do campo: o toque não se perde.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => escolher(p.nome)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft ${
                    p.nome === valor ? "bg-primary-soft/60 font-semibold text-primary-dark" : "text-slate-700"
                  }`}
                >
                  {p.nome}
                  {p.cargo && <span className="ml-1 text-xs text-slate-400">· {p.cargo}</span>}
                </button>
              ))}
              {achadas.length > MAXIMO && (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                  Mais {achadas.length - MAXIMO} nomes: digite para encontrar.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
