"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Pessoa = { id: string; nome: string };
type ResultadoCriar = { ok: true; nome: string } | { ok: false; erro: string };

/**
 * Formata CPF enquanto digita (000.000.000-00) -- só cosmético, o servidor
 * já limpa pra 11 dígitos antes de gravar.
 */
function formatarCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Cadastro rápido em popover, aberto pelo "+" -- pedido do dono
 * (27/08/2026): nome completo + CPF, os dois exigidos pelo mesmo cadastro
 * do Admin (ver salvarMotorista/salvarEmpilhador). Fecha sozinho e já
 * escolhe o nome recém-criado ao salvar com sucesso.
 */
function PopoverCadastroRapido({
  nomeInicial,
  criarRapido,
  onCriado,
  onFechar,
}: {
  nomeInicial: string;
  criarRapido: (formData: FormData) => Promise<ResultadoCriar>;
  onCriado: (nome: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("nome", nome);
      fd.set("cpf", cpf);
      const resultado = await criarRapido(fd);
      if (resultado.ok) onCriado(resultado.nome);
      else setErro(resultado.erro);
    });
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[90vw] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-xs font-bold uppercase text-slate-500">Cadastrar novo</p>
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome completo"
        className={campo}
        autoFocus
      />
      <input
        type="text"
        inputMode="numeric"
        value={cpf}
        onChange={(e) => setCpf(formatarCpf(e.target.value))}
        placeholder="CPF (000.000.000-00)"
        maxLength={14}
        className={campo}
      />
      {erro && <p className="text-xs font-medium text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFechar}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pending}
          className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

/**
 * Campo de nome com busca (motorista, empilhador) -- mesma interação do
 * ComboboxProduto, mas sem campo escondido de id: motorista/empilhador
 * continuam texto livre nas tabelas de atendimento, então clicar numa
 * sugestão só preenche o próprio campo visível. Digitar um nome que não
 * está na lista continua funcionando -- a busca ajuda, não obriga.
 *
 * `criarRapido` é opcional: quando passado, aparece o "+" quadrado no
 * canto direito do campo (padrão visual pedido pelo dono, 27/08/2026) que
 * abre um cadastro rápido sem sair da tela.
 */
export function ComboboxNome({
  nome,
  onChange,
  buscar,
  placeholder = "Digite o nome",
  required = false,
  className,
  criarRapido,
}: {
  nome: string;
  onChange: (valor: string) => void;
  buscar: (termo: string) => Promise<Pessoa[]>;
  placeholder?: string;
  required?: boolean;
  className?: string;
  criarRapido?: (formData: FormData) => Promise<ResultadoCriar>;
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
          className="absolute right-1 top-1 flex h-[calc(100%-0.5rem)] aspect-square items-center justify-center rounded-lg bg-primary text-lg font-bold leading-none text-white hover:bg-primary-dark"
        >
          +
        </button>
      )}
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
      {popoverAberto && criarRapido && (
        <PopoverCadastroRapido
          nomeInicial={nome}
          criarRapido={criarRapido}
          onFechar={() => setPopoverAberto(false)}
          onCriado={(nomeCriado) => {
            onChange(nomeCriado);
            setPopoverAberto(false);
          }}
        />
      )}
    </div>
  );
}
