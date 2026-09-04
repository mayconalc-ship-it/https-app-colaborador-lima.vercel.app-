"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarProdutosDoCadastro } from "@/app/admin/produtividade-armazem/actions";

type Achado = { id: string; codigo: string; descricao: string; ativo: boolean };

const ROTA = "/admin/produtividade-armazem?aba=reepack-despejo";

/**
 * A BUSCA DO CADASTRO DE PRODUTOS, com a lista suspensa ao digitar
 * (pedido do dono, 05/09/2026: "o campo de busca também precisa ter a
 * lista suspensa após digitar o nome ou informar o código").
 *
 * Antes era um formulário GET puro: digitar, apertar Buscar, a tela
 * recarregava e a lista vinha filtrada. Funcionava, mas obrigava a
 * acertar o termo de primeira -- numa base de 324 produtos com nomes
 * como "GFE SEM GARRAFA 600ML", errar uma palavra devolve uma lista
 * vazia e nenhuma pista. A lista suspensa mostra o que existe ENQUANTO
 * se digita, e a pessoa reconhece em vez de adivinhar.
 *
 * ESCOLHER UM PRODUTO FILTRA A LISTA PELO CÓDIGO, que é único: o item
 * fica sozinho na tela, pronto para o "✏️ Editar". Não uso âncora nem
 * rolagem até ele porque a lista mostra 324 itens e rolar até um deles
 * deixaria os outros 323 em volta, competindo com o que a pessoa
 * escolheu.
 *
 * O botão Buscar continua ali, e não é redundante: buscar por "HALLS"
 * para ver os cinco de uma vez é uma intenção diferente de abrir um.
 */
export function BuscaProdutoCadastro({ termoAtual }: { termoAtual: string }) {
  const router = useRouter();
  const [termo, setTermo] = useState(termoAtual);
  const [resultados, setResultados] = useState<Achado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();
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
    setTermo(valor);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    // 400ms: digitação é barulhenta, e cada tecla viraria uma ida ao
    // banco. É o mesmo intervalo dos outros comboboxes do app.
    relogio.current = setTimeout(() => {
      if (valor.trim().length < 2) {
        setResultados([]);
        return;
      }
      iniciarTransicao(async () => {
        try {
          setResultados(await buscarProdutosDoCadastro(valor));
        } catch {
          // A falha aparece como "nenhum resultado", e o botão Buscar
          // continua funcionando -- ele passa pelo servidor por outro
          // caminho. Derrubar a tela por causa da busca seria pior.
          setResultados([]);
        }
      });
    }, 400);
  }

  function abrirProduto(p: Achado) {
    setAberto(false);
    setTermo(p.codigo);
    router.push(`${ROTA}&buscaReepack=${encodeURIComponent(p.codigo)}`);
  }

  function buscarTermo() {
    setAberto(false);
    router.push(`${ROTA}&buscaReepack=${encodeURIComponent(termo.trim())}`);
  }

  return (
    <div ref={caixaRef} className="relative">
      <label
        className="mb-1 block text-xs font-bold uppercase tracking-wide text-primary-dark"
        htmlFor="busca-produto-cadastro"
      >
        🔎 Procurar um produto
      </label>
      <div className="flex gap-2">
        <input
          id="busca-produto-cadastro"
          type="text"
          value={termo}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscarTermo();
            }
            if (e.key === "Escape") setAberto(false);
          }}
          placeholder="Digite o código ou o nome do produto"
          autoComplete="off"
          className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={buscarTermo}
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
              router.push(ROTA);
            }}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
            title="Mostrar todos os produtos de novo"
          >
            Limpar
          </button>
        )}
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {pendente ? (
            <p className="p-3 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">Nenhum produto encontrado.</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => abrirProduto(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft"
              >
                <span className="font-semibold text-slate-800">{p.codigo}</span>{" "}
                <span className="text-slate-600">— {p.descricao}</span>
                {/* O desativado aparece na lista (reativar exige
                    encontrá-lo), mas dito, senão a pessoa edita um
                    produto que não está em uso sem saber. */}
                {!p.ativo && (
                  <span className="ml-1 text-xs font-semibold text-amber-600">· desativado</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
