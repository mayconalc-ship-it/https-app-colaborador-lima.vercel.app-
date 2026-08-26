"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Pessoa = { id: string; nome: string };

/**
 * Campo de nome com busca (motorista, empilhador) -- mesma interação do
 * ComboboxProduto, mas sem campo escondido de id: motorista/empilhador
 * continuam texto livre nas tabelas de atendimento, então clicar numa
 * sugestão só preenche o próprio campo visível. Digitar um nome que não
 * está na lista continua funcionando -- a busca ajuda, não obriga.
 */
export function ComboboxNome({
  nome,
  onChange,
  buscar,
  placeholder = "Digite o nome",
  required = false,
  className,
}: {
  nome: string;
  onChange: (valor: string) => void;
  buscar: (termo: string) => Promise<Pessoa[]>;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [resultados, setResultados] = useState<Pessoa[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function aoDigitar(valor: string) {
    onChange(valor);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    relogio.current = setTimeout(() => {
      startTransition(async () => {
        const r = await buscar(valor);
        setResultados(r);
      });
    }, 400);
  }

  function escolher(p: Pessoa) {
    onChange(p.nome);
    setAberto(false);
  }

  return (
    <div ref={caixaRef} className="relative">
      <input
        type="text"
        value={nome}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        required={required}
        className={className ?? campo}
        autoComplete="off"
      />
      {aberto && nome.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {pending ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">Nenhum nome cadastrado com isso -- pode digitar mesmo assim.</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-primary-soft"
              >
                {p.nome}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
