"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CLASSE_MAIS } from "@/components/BotaoMais";
import { PopoverCadastroRapido, type CriarRapido } from "@/components/CadastroRapido";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Pessoa = { id: string; nome: string };

/** Nome completo + CPF -- a mesma exigência do cadastro no Admin
 *  (ver salvarMotorista/salvarEmpilhador). */
const CAMPOS_PESSOA = [
  { nome: "nome", rotulo: "Nome completo" },
  { nome: "cpf", rotulo: "CPF (000.000.000-00)", tipo: "cpf" as const },
];

/**
 * Campo de nome com busca (motorista, empilhador) -- mesma interação do
 * ComboboxProduto, mas sem campo escondido de id: motorista/empilhador
 * continuam texto livre nas tabelas de atendimento, então clicar numa
 * sugestão só preenche o próprio campo visível. Digitar um nome que não
 * está na lista continua funcionando -- a busca ajuda, não obriga.
 *
 * `criarRapido` é opcional: quando passado, aparece o "+" quadrado no
 * canto direito do campo (padrão visual do app, ver BotaoMais) que abre um
 * cadastro rápido sem sair da tela. Quem monta a tela só passa a ação para
 * quem tem permissão -- e a ação confere de novo no servidor.
 */
export function ComboboxNome({
  nome,
  onChange,
  buscar,
  placeholder = "Digite o nome",
  required = false,
  className,
  criarRapido,
  sugestoes = [],
}: {
  nome: string;
  onChange: (valor: string) => void;
  buscar: (termo: string) => Promise<Pessoa[]>;
  placeholder?: string;
  required?: boolean;
  className?: string;
  criarRapido?: CriarRapido;
  /** Lista já cadastrada, mostrada assim que o campo recebe o toque --
   *  sem exigir que a pessoa acerte 2 letras de um nome que ela não sabe.
   *  Vale para catálogo curto (empilhadores da casa); para lista grande
   *  (motoristas de fora) deixe vazio e confie na busca. */
  sugestoes?: Pessoa[];
}) {
  const [resultados, setResultados] = useState<Pessoa[]>([]);
  const [aberto, setAberto] = useState(false);
  const [popoverAberto, setPopoverAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) {
        setAberto(false);
        setPopoverAberto(false);
      }
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

  // Digitou 2+ letras: manda a busca no servidor. Antes disso, mostra o
  // catálogo que veio pronto -- é o que faz a lista aparecer no primeiro
  // toque, sem a pessoa ter que adivinhar o começo do nome.
  const buscando = nome.trim().length >= 2;
  const lista = buscando ? resultados : sugestoes;

  return (
    <div ref={caixaRef} className="relative">
      <input
        type="text"
        value={nome}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        required={required}
        className={`${className ?? campo} ${criarRapido ? "pr-11" : ""}`}
        autoComplete="off"
      />
      {criarRapido && (
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setPopoverAberto(true);
          }}
          aria-label="Cadastrar novo"
          className={`absolute right-1 top-1 h-[calc(100%-0.5rem)] ${CLASSE_MAIS} hover:bg-primary-dark`}
        >
          +
        </button>
      )}
      {aberto && (buscando || sugestoes.length > 0) && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {!buscando && (
            <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase text-slate-400">
              Cadastrados
            </p>
          )}
          {buscando && pending ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : lista.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">Nenhum nome cadastrado com isso -- pode digitar mesmo assim.</p>
          ) : (
            lista.map((p) => (
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
      {popoverAberto && criarRapido && (
        <PopoverCadastroRapido
          campos={CAMPOS_PESSOA}
          valoresIniciais={{ nome }}
          criarRapido={criarRapido}
          onFechar={() => setPopoverAberto(false)}
          onCriado={(criado) => {
            onChange(criado.rotulo);
            setPopoverAberto(false);
          }}
        />
      )}
    </div>
  );
}
