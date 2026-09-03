"use client";

import { useEffect, useRef, useState, useTransition } from "react";

export type PessoaEncontrada = { id: string; nome: string; cargo?: string | null };

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

/**
 * Digite o nome, escolha na lista -- e só então aja.
 *
 * O que havia antes era um formulário GET: digitar, apertar "Buscar",
 * recarregar a página inteira, achar a lista de resultados que apareceu
 * em algum lugar dela e clicar num segundo botão. Três passos e uma volta
 * ao servidor para escolher uma pessoa que o app já conhece. O dono pediu
 * "a lista suspensa com a opção de digitar o nome e escolher"
 * (03/09/2026), que é a interação que os campos de motorista e
 * empilhador do próprio app já têm há tempos (ver ComboboxNome).
 *
 * Aqui a busca acontece enquanto se digita, a lista cai abaixo do campo, e
 * escolher um nome já deixa o formulário pronto para enviar. A pessoa
 * escolhida vira dois campos escondidos -- id e nome -- porque quem grava
 * precisa do id, e a lista de depois precisa do nome para não virar uma
 * coluna de uuid.
 *
 * Enviar SEM escolher é impossível de propósito: o botão só habilita
 * depois da escolha. Digitar um nome parecido e mandar seria gravar um
 * lembrete para ninguém.
 */
export function SeletorDePessoa({
  buscar,
  campoId,
  campoNome,
  placeholder = "Digite o nome ou CPF",
  aoEscolher,
  /** Some com o campo depois que a ação roda -- o formulário volta ao
   *  estado inicial em vez de ficar com o nome de quem acabou de entrar. */
  chaveDeReset,
}: {
  buscar: (termo: string) => Promise<PessoaEncontrada[]>;
  campoId: string;
  campoNome?: string;
  placeholder?: string;
  aoEscolher?: (p: PessoaEncontrada | null) => void;
  chaveDeReset?: string;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<PessoaEncontrada[]>([]);
  const [escolhida, setEscolhida] = useState<PessoaEncontrada | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTermo("");
    setEscolhida(null);
    setResultados([]);
  }, [chaveDeReset]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function aoDigitar(valor: string) {
    setTermo(valor);
    setAberto(true);
    // Digitar depois de escolher desfaz a escolha: o nome no campo e a
    // pessoa gravada precisam ser a mesma coisa, sempre.
    if (escolhida) {
      setEscolhida(null);
      aoEscolher?.(null);
    }
    if (relogio.current) clearTimeout(relogio.current);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    // 400ms: o suficiente para não disparar uma busca por tecla, e curto
    // o bastante para a lista parecer instantânea.
    relogio.current = setTimeout(() => {
      iniciar(async () => setResultados(await buscar(valor)));
    }, 400);
  }

  function escolher(p: PessoaEncontrada) {
    setEscolhida(p);
    setTermo(p.nome);
    setAberto(false);
    aoEscolher?.(p);
  }

  return (
    <div ref={caixa} className="relative min-w-0 flex-1">
      <input type="hidden" name={campoId} value={escolhida?.id ?? ""} />
      {campoNome && (
        <input type="hidden" name={campoNome} value={escolhida?.nome ?? ""} />
      )}

      <input
        type="text"
        value={termo}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${campo} ${escolhida ? "border-primary bg-primary-soft/40" : ""}`}
      />

      {aberto && termo.trim().length >= 2 && !escolhida && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {pendente ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">Ninguém encontrado.</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-primary-soft"
              >
                {p.nome}
                {p.cargo && (
                  <span className="ml-1 text-xs text-slate-400">· {p.cargo}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O seletor + o que mais o formulário precisar + o botão, numa linha.
 *
 * `extras` vem pronto de quem monta a tela (o <select> de turno, por
 * exemplo) -- é JSX passado de um componente de servidor para este, o que
 * o React permite e evita ter um componente cliente diferente para cada
 * formulário que escolhe uma pessoa.
 */
export function FormularioComPessoa({
  action,
  buscar,
  campoId,
  campoNome,
  placeholder,
  rotuloBotao,
  extras,
  ocultos,
}: {
  action: (formData: FormData) => void;
  buscar: (termo: string) => Promise<PessoaEncontrada[]>;
  campoId: string;
  campoNome?: string;
  placeholder?: string;
  rotuloBotao: string;
  extras?: React.ReactNode;
  ocultos?: Record<string, string>;
}) {
  const [temPessoa, setTemPessoa] = useState(false);
  const [envio, setEnvio] = useState(0);

  return (
    <form
      action={action}
      onSubmit={() => {
        // Limpa o campo assim que sai: o formulário fica pronto para o
        // próximo, em vez de guardar o nome de quem acabou de entrar na
        // lista logo abaixo.
        setTemPessoa(false);
        setEnvio((n) => n + 1);
      }}
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      {Object.entries(ocultos ?? {}).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <SeletorDePessoa
        buscar={buscar}
        campoId={campoId}
        campoNome={campoNome}
        placeholder={placeholder}
        aoEscolher={(p) => setTemPessoa(Boolean(p))}
        chaveDeReset={String(envio)}
      />
      {extras}
      <button
        type="submit"
        disabled={!temPessoa}
        // Sem pessoa escolhida o botão não age: mandar um nome digitado
        // "parecido" gravaria um cadastro para ninguém.
        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {rotuloBotao}
      </button>
    </form>
  );
}
