"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarOperadoresComOperacao } from "@/app/admin/produtividade-armazem/actions";

type Achado = { nome: string; operacoes: number };

const ROTA = "/admin/produtividade-armazem?aba=empilhadeiras";

/**
 * A busca do "Corrigir ou excluir operação" -- com lista suspensa, e SEM
 * sair do lugar.
 *
 * Pedido do dono (05/09/2026): "deixe o combobox com a lista suspensa
 * para ao digitar aparecer o nome, após buscar, apenas busque e permaneça
 * dentro do campo aberto. Hoje ele está fechando e subindo a tela".
 *
 * Era um `<form method="get">`: apertar Buscar era uma navegação
 * completa. Navegação remonta o documento, e `open` de um `<details>` é
 * estado do DOM -- então o painel que ele tinha acabado de abrir fechava,
 * e a página voltava ao topo. Para ver o resultado da própria busca era
 * preciso rolar até o cartão e abrir de novo.
 *
 * `router.replace(..., { scroll: false })` faz a mesma filtragem por
 * navegação SUAVE: o React troca só o que mudou, o `<details>` continua
 * montado (e aberto), e a rolagem fica onde estava. `replace` e não
 * `push` porque cada tecla digitada não é um passo do histórico -- com
 * push, o botão Voltar do celular percorreria letra por letra do que foi
 * digitado antes de sair da tela.
 */
export function BuscaOperacaoEmpilhadeira({ termoAtual }: { termoAtual: string }) {
  const router = useRouter();
  const [termo, setTermo] = useState(termoAtual);
  const [resultados, setResultados] = useState<Achado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function aoDigitar(valor: string) {
    setTermo(valor);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      if (valor.trim().length < 2) {
        setResultados([]);
        return;
      }
      iniciar(async () => {
        try {
          setResultados(await buscarOperadoresComOperacao(valor));
        } catch {
          setResultados([]);
        }
      });
    }, 400);
  }

  function filtrar(valor: string) {
    setAberto(false);
    const alvo = valor.trim();
    router.replace(alvo ? `${ROTA}&buscaHorimetro=${encodeURIComponent(alvo)}` : ROTA, {
      scroll: false,
    });
  }

  return (
    <div ref={caixa} className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={termo}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              filtrar(termo);
            }
            if (e.key === "Escape") setAberto(false);
          }}
          placeholder="Digite o nome do operador"
          autoComplete="off"
          className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => filtrar(termo)}
          className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
        >
          Buscar
        </button>
        {termoAtual && (
          <button
            type="button"
            onClick={() => {
              setTermo("");
              setResultados([]);
              filtrar("");
            }}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
          >
            Limpar
          </button>
        )}
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {pendente ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">
              Ninguém com operação registrada por esse nome.
            </p>
          ) : (
            resultados.map((o) => (
              <button
                key={o.nome}
                type="button"
                onClick={() => {
                  setTermo(o.nome);
                  filtrar(o.nome);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-primary-soft"
              >
                <span className="min-w-0 truncate text-slate-700">{o.nome}</span>
                {/* Quantas operações ele tem no recorte: é o número que
                    diz se vale abrir aquele nome. */}
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {o.operacoes}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
