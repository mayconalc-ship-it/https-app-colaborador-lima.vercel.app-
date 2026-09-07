"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none read-only:bg-slate-50";

export type ItemDeLista = { nome: string; ajuda?: string };

/**
 * CAMPO COM LISTA SUSPENSA E TEXTO LIVRE.
 *
 * Pedido do dono (07/09/2026): área, sala e IC/IV cadastráveis, com menu
 * suspenso.
 *
 * `<datalist>` e não `<select>`, e a diferença importa: o select obriga a
 * lista a estar completa ANTES de alguém conseguir preencher o documento.
 * Numa reunião de anomalia, a sala que falta na lista não pode travar o
 * relato -- quem digita um valor novo o usa agora, e ele entra no catálogo
 * ao salvar (ver guardarNoCatalogo). A lista certa é a que nasce do uso.
 *
 * A ajuda de cada item aparece na lista do navegador ("indicador com
 * gatilho ligado"), que é onde ela serve: na hora de escolher.
 */
export function CampoDeLista({
  nome,
  id,
  valorInicial,
  itens,
  placeholder,
  somenteLeitura = false,
}: {
  nome: string;
  id: string;
  valorInicial: string;
  itens: ItemDeLista[];
  placeholder?: string;
  somenteLeitura?: boolean;
}) {
  const idLista = `lista-${id}`;
  return (
    <>
      <input
        id={id}
        name={nome}
        list={somenteLeitura ? undefined : idLista}
        defaultValue={valorInicial}
        readOnly={somenteLeitura}
        placeholder={placeholder}
        autoComplete="off"
        className={campo}
      />
      {!somenteLeitura && (
        <datalist id={idLista}>
          {itens.map((i) => (
            <option key={i.nome} value={i.nome} label={i.ajuda} />
          ))}
        </datalist>
      )}
    </>
  );
}

export type PessoaAchada = { id: string; nome: string; cargo: string | null };

/**
 * O COMBOBOX DE UMA PESSOA -- responsável, gestor, dono de uma ação.
 *
 * Pedido do dono (07/09/2026): "participantes precisa inserir o combobox
 * dos colaboradores, quem precisa de combobox também, nome do responsável
 * combobox e nome do gestor com combobox".
 *
 * O QUE FICA GRAVADO CONTINUA SENDO O NOME, e isso é escolha: o relato é
 * um documento, e um documento que aponta para um id vira ilegível no dia
 * em que a pessoa sai da empresa e o cadastro some. A busca serve para
 * ACERTAR o nome -- "Neuilton" escrito de três jeitos são três pessoas
 * diferentes para qualquer contagem futura.
 *
 * E o campo continua aceitando quem não está no cadastro: a reunião pode
 * ter um convidado da fábrica.
 */
export function ComboboxDePessoa({
  nome,
  id,
  valorInicial,
  buscar,
  placeholder = "Digite o nome",
  somenteLeitura = false,
  obrigatorio = false,
}: {
  nome: string;
  id: string;
  valorInicial: string;
  buscar: (termo: string) => Promise<PessoaAchada[]>;
  placeholder?: string;
  somenteLeitura?: boolean;
  obrigatorio?: boolean;
}) {
  const [valor, setValor] = useState(valorInicial);
  const [achados, setAchados] = useState<PessoaAchada[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function digitar(v: string) {
    setValor(v);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      if (v.trim().length < 2) {
        setAchados([]);
        return;
      }
      iniciar(async () => {
        try {
          setAchados(await buscar(v));
        } catch {
          setAchados([]);
        }
      });
    }, 350);
  }

  if (somenteLeitura) {
    return <input name={nome} id={id} value={valor} readOnly className={campo} />;
  }

  return (
    <div ref={caixa} className="relative">
      <input
        id={id}
        name={nome}
        value={valor}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
        }}
        required={obrigatorio}
        placeholder={placeholder}
        autoComplete="off"
        className={campo}
      />
      {aberto && valor.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {pendente ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : achados.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">
              Ninguém com esse nome no cadastro. Dá para escrever assim mesmo.
            </p>
          ) : (
            achados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setValor(p.nome);
                  setAberto(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft"
              >
                <span className="font-medium text-slate-800">{p.nome}</span>
                {p.cargo && <span className="block text-xs text-slate-400">{p.cargo}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * OS PARTICIPANTES -- várias pessoas, uma de cada vez.
 *
 * Era um campo de texto com "separe por vírgula", e vírgula é onde nome
 * composto vira duas pessoas. Aqui cada participante entra como uma marca,
 * e sai com um toque -- e o que vai para o banco é a lista, não um texto
 * para alguém repartir depois.
 */
export function ParticipantesDoRelato({
  nome,
  iniciais,
  buscar,
  somenteLeitura = false,
}: {
  nome: string;
  iniciais: string[];
  buscar: (termo: string) => Promise<PessoaAchada[]>;
  somenteLeitura?: boolean;
}) {
  const [pessoas, setPessoas] = useState<string[]>(iniciais);
  const [rascunho, setRascunho] = useState("");
  const [achados, setAchados] = useState<PessoaAchada[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function incluir(quem: string) {
    const limpo = quem.trim();
    if (!limpo) return;
    setPessoas((atual) => (atual.includes(limpo) ? atual : [...atual, limpo]));
    setRascunho("");
    setAchados([]);
    setAberto(false);
  }

  function digitar(v: string) {
    setRascunho(v);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      if (v.trim().length < 2) {
        setAchados([]);
        return;
      }
      iniciar(async () => {
        try {
          setAchados(await buscar(v));
        } catch {
          setAchados([]);
        }
      });
    }, 350);
  }

  return (
    <div>
      {/* O valor real vai num campo escondido, um por participante: é
          assim que o HTML manda lista, e é o que o servidor já espera. */}
      {pessoas.map((p) => (
        <input key={p} type="hidden" name={nome} value={p} />
      ))}

      {pessoas.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {pessoas.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-sm text-slate-700"
            >
              {p}
              {!somenteLeitura && (
                <button
                  type="button"
                  onClick={() => setPessoas((atual) => atual.filter((x) => x !== p))}
                  aria-label={`Tirar ${p}`}
                  className="text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!somenteLeitura && (
        <div ref={caixa} className="relative">
          <input
            value={rascunho}
            onChange={(e) => digitar(e.target.value)}
            onFocus={() => setAberto(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAberto(false);
              // Enter inclui quem foi digitado, e NÃO envia o formulário:
              // ninguém quer fechar o relato ao terminar um nome.
              if (e.key === "Enter") {
                e.preventDefault();
                incluir(rascunho);
              }
            }}
            placeholder="Digite o nome e toque no resultado (ou aperte Enter)"
            autoComplete="off"
            className={campo}
          />
          {aberto && rascunho.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {pendente ? (
                <p className="p-3 text-sm text-slate-400">Buscando...</p>
              ) : achados.length === 0 ? (
                <button
                  type="button"
                  onClick={() => incluir(rascunho)}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-primary-soft"
                >
                  Incluir <strong>{rascunho.trim()}</strong> assim mesmo
                </button>
              ) : (
                achados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => incluir(p.nome)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft"
                  >
                    <span className="font-medium text-slate-800">{p.nome}</span>
                    {p.cargo && <span className="block text-xs text-slate-400">{p.cargo}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
