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

const RECADO_SO_CADASTRADOS = "Escolha um nome da lista, ou cadastre pelo + ao lado.";

/**
 * Campo de nome com busca (motorista, empilhador) -- mesma interação do
 * ComboboxProduto.
 *
 * DOIS MODOS, e quem monta a tela escolhe:
 *
 *   LIVRE (o padrão): clicar numa sugestão só preenche o campo, e digitar
 *   um nome fora da lista continua funcionando. É o do empilhador na
 *   Conferência, e não mudou.
 *
 *   SÓ CADASTRADOS (`somenteCadastrados`): o nome digitado não vale nada
 *   até ser ESCOLHIDO da lista -- ou criado pelo "+". O id escolhido vai
 *   num campo escondido (`nomeCampoId`), e é ele que o servidor confere.
 *   Pedido do dono (10/09/2026) para o motorista da Portaria: 16 de 17
 *   atendimentos tinham nome digitado fora do cadastro, sem CPF, e um
 *   atendimento que não identifica o motorista não serve para cruzar
 *   blitz nem avaria.
 *
 *   O bloqueio é a VALIDAÇÃO NATIVA do formulário (`setCustomValidity`),
 *   e não um botão desabilitado: o navegador aponta o campo e diz o que
 *   fazer, em vez de a pessoa ficar olhando um "Registrar" que não
 *   responde sem saber por quê. O servidor confere de novo -- esconder o
 *   caminho não é regra.
 *
 * `criarRapido` é opcional: quando passado, aparece o "+" quadrado no
 * canto direito do campo (padrão visual do app, ver BotaoMais) que abre um
 * cadastro rápido sem sair da tela.
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
  somenteCadastrados = false,
  nomeCampoId,
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
   *  No modo `somenteCadastrados` é a lista suspensa inteira. */
  sugestoes?: Pessoa[];
  /** Só aceita nome escolhido da lista (ou criado pelo "+"). */
  somenteCadastrados?: boolean;
  /** Nome do campo escondido que leva o id escolhido ao servidor. */
  nomeCampoId?: string;
}) {
  const [resultados, setResultados] = useState<Pessoa[]>([]);
  const [aberto, setAberto] = useState(false);
  const [popoverAberto, setPopoverAberto] = useState(false);
  /** O cadastro escolhido. Qualquer letra digitada depois desfaz a
   *  escolha: o texto no campo passou a ser outro nome. */
  const [escolhido, setEscolhido] = useState<Pessoa | null>(null);
  /** Criados pelo "+" nesta tela, para aparecerem na lista sem recarregar. */
  const [criadosAqui, setCriadosAqui] = useState<Pessoa[]>([]);
  const [pending, startTransition] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

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

  // A trava do modo SÓ CADASTRADOS: com texto e sem escolha, o formulário
  // não envia, e o navegador diz por quê apontando para este campo.
  useEffect(() => {
    if (!somenteCadastrados || !campoRef.current) return;
    const semEscolha = nome.trim().length > 0 && !escolhido;
    campoRef.current.setCustomValidity(semEscolha ? RECADO_SO_CADASTRADOS : "");
  }, [somenteCadastrados, nome, escolhido]);

  function aoDigitar(valor: string) {
    onChange(valor);
    if (escolhido && valor !== escolhido.nome) setEscolhido(null);
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
    setEscolhido(p);
    setAberto(false);
  }

  // Digitou 2+ letras: manda a busca no servidor. Antes disso, mostra o
  // catálogo que veio pronto -- é o que faz a lista aparecer no primeiro
  // toque, sem a pessoa ter que adivinhar o começo do nome.
  const buscando = nome.trim().length >= 2 && !escolhido;
  const catalogo = [...criadosAqui, ...sugestoes.filter((s) => !criadosAqui.some((c) => c.id === s.id))];
  const lista = buscando ? resultados : catalogo;

  return (
    <div ref={caixaRef} className="relative">
      <input
        ref={campoRef}
        type="text"
        value={nome}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        required={required}
        className={`${className ?? campo} ${criarRapido ? "pr-11" : ""} ${
          somenteCadastrados && escolhido ? "border-green-400 bg-green-50/40" : ""
        }`}
        autoComplete="off"
      />
      {somenteCadastrados && nomeCampoId && (
        <input type="hidden" name={nomeCampoId} value={escolhido?.id ?? ""} />
      )}
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
      {aberto && (buscando || catalogo.length > 0 || somenteCadastrados) && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {!buscando && catalogo.length > 0 && (
            <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase text-slate-400">
              Cadastrados
            </p>
          )}
          {buscando && pending ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : lista.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">
              {/* No modo SÓ CADASTRADOS o recado muda de sentido: não é
                  mais "pode digitar", é "o caminho é o +". Dizer "pode
                  digitar" aqui seria mandar a pessoa para um envio que vai
                  ser recusado. */}
              {somenteCadastrados
                ? buscando
                  ? "Ninguém cadastrado com esse nome — cadastre pelo + ao lado."
                  : "Nenhum cadastrado ainda — cadastre pelo + ao lado."
                : "Nenhum nome cadastrado com isso -- pode digitar mesmo assim."}
            </p>
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
            // No modo SÓ CADASTRADOS o "+" já deixa o recém-criado
            // escolhido: quem acabou de cadastrar não pode ter de achá-lo
            // na lista em seguida. `valor` é o id (ver criarMotoristaRapido).
            if (somenteCadastrados) {
              const novo = { id: criado.valor, nome: criado.rotulo };
              setEscolhido(novo);
              setCriadosAqui((atual) => [novo, ...atual]);
            }
            setPopoverAberto(false);
          }}
        />
      )}
    </div>
  );
}
