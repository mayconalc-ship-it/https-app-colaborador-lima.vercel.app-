"use client";

import { useEffect, useRef, useState } from "react";
import { CLASSE_MAIS } from "@/components/BotaoMais";
import { PopoverCadastroRapido, type CampoRapido, type CriarRapido } from "@/components/CadastroRapido";

const campoClasse =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

export type OpcaoSelect = { valor: string; rotulo: string };

/**
 * `<select>` de catálogo com o "+" quadrado azul no canto direito -- mesmo
 * padrão do campo de motorista na Portaria, agora para fábrica,
 * transportadora, AG e afins.
 *
 * O "+" só é renderizado quando `criarRapido` vem preenchido, e quem monta
 * a tela só passa isso para quem tem permissão de mexer no catálogo. A
 * própria ação confere a permissão no servidor -- esconder o botão é
 * conveniência, não segurança.
 *
 * `usarRotuloComoValor` existe porque nem todo campo guarda id: o destino
 * do retorno da carreta, por exemplo, grava o NOME da fábrica.
 */
export function SelectComCadastroRapido({
  id,
  name,
  opcoes,
  required,
  placeholder,
  valorInicial,
  criarRapido,
  campos,
  tituloCadastro,
  usarRotuloComoValor = false,
  aoCriar,
}: {
  id?: string;
  name: string;
  opcoes: OpcaoSelect[];
  required?: boolean;
  placeholder?: string;
  valorInicial?: string;
  criarRapido?: CriarRapido;
  campos?: CampoRapido[];
  tituloCadastro?: string;
  usarRotuloComoValor?: boolean;
  /** Avisa o pai do que foi criado -- serve para listas repetidas, onde
   *  todas as linhas precisam enxergar o cadastro novo. */
  aoCriar?: (criado: OpcaoSelect) => void;
}) {
  // A lista some das props E do que foi criado aqui: assim um cadastro
  // feito nesta linha continua visível mesmo se o pai não sincronizar,
  // e um cadastro vindo do pai aparece sem duplicar.
  const [criadas, setCriadas] = useState<OpcaoSelect[]>([]);
  const lista = [...opcoes, ...criadas.filter((c) => !opcoes.some((o) => o.valor === c.valor))];
  // Sem `placeholder`, o campo já vem com a primeira opção escolhida --
  // é como o `<select>` simples se comportava antes, e trocar isso
  // obrigaria a portaria a escolher a fábrica de novo a cada carreta.
  const [valor, setValor] = useState(valorInicial ?? (placeholder ? "" : (opcoes[0]?.valor ?? "")));
  const [popoverAberto, setPopoverAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setPopoverAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const podeCadastrar = !!criarRapido && !!campos && campos.length > 0;

  return (
    <div ref={caixaRef} className="relative">
      <select
        id={id}
        name={name}
        required={required}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className={`${campoClasse} ${podeCadastrar ? "pr-12" : ""}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {lista.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>

      {podeCadastrar && (
        <button
          type="button"
          onClick={() => setPopoverAberto(true)}
          aria-label="Cadastrar novo"
          className={`absolute right-1 top-1 h-[calc(100%-0.5rem)] ${CLASSE_MAIS} hover:bg-primary-dark`}
        >
          +
        </button>
      )}

      {popoverAberto && podeCadastrar && (
        <PopoverCadastroRapido
          titulo={tituloCadastro}
          campos={campos}
          criarRapido={criarRapido}
          onFechar={() => setPopoverAberto(false)}
          onCriado={(criado) => {
            const nova = { valor: usarRotuloComoValor ? criado.rotulo : criado.valor, rotulo: criado.rotulo };
            setCriadas((atual) => (atual.some((o) => o.valor === nova.valor) ? atual : [...atual, nova]));
            setValor(nova.valor);
            setPopoverAberto(false);
            aoCriar?.(nova);
          }}
        />
      )}
    </div>
  );
}
