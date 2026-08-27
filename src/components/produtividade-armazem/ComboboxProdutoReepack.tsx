"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarProdutosReepack } from "@/app/admin/produtividade-armazem/actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Produto = { id: string; codigo: string; descricao: string };

const ROTULO_TIPO: Record<string, string> = {
  DESCARTAVEL: "Descartável",
  RETORNAVEL: "Retornável",
};

/**
 * Cluster → Tipo → Produto, pedido do dono (27/08/2026) pra achar produto
 * mais rápido numa base de centenas de itens. Os dois primeiros filtram o
 * terceiro: escolher só Cluster e Tipo já lista os produtos (sem precisar
 * digitar nada), e digitar dentro disso refina por nome ou código.
 *
 * Fica em um componente à parte do ComboboxProduto genérico (usado por
 * Recebimento) de propósito -- aqui o `buscar` precisa reagir à troca dos
 * selects, não só à digitação, e misturar os dois comportamentos no
 * componente genérico complicaria quem só usa a busca simples.
 */
export function ComboboxProdutoReepack({
  clusters,
  tipos,
  valorInicial,
  nomeCampo = "produto_id",
}: {
  clusters: string[];
  tipos: string[];
  valorInicial?: string;
  nomeCampo?: string;
}) {
  const [cluster, setCluster] = useState("");
  const [tipo, setTipo] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [selecionado, setSelecionado] = useState<Produto | null>(null);
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

  // Dispara a busca quando o termo muda (com debounce, digitação é
  // barulhenta) OU quando cluster/tipo mudam (na hora -- é clique, não
  // digitação, não precisa esperar).
  function buscar(termoAtual: string, clusterAtual: string, tipoAtual: string) {
    const temFiltro = Boolean(clusterAtual || tipoAtual);
    if (termoAtual.trim().length < 2 && !temFiltro) {
      setResultados([]);
      return;
    }
    startTransition(async () => {
      const r = await buscarProdutosReepack(termoAtual, {
        cluster: clusterAtual || undefined,
        tipo: tipoAtual || undefined,
      });
      setResultados(r);
    });
  }

  function aoDigitar(valor: string) {
    setTermo(valor);
    setSelecionado(null);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => buscar(valor, cluster, tipo), 400);
  }

  function aoMudarCluster(valor: string) {
    setCluster(valor);
    setSelecionado(null);
    setAberto(true);
    buscar(termo, valor, tipo);
  }

  function aoMudarTipo(valor: string) {
    setTipo(valor);
    setSelecionado(null);
    setAberto(true);
    buscar(termo, cluster, valor);
  }

  function escolher(p: Produto) {
    setSelecionado(p);
    setTermo(`${p.codigo} — ${p.descricao}`);
    setAberto(false);
  }

  const temFiltro = Boolean(cluster || tipo);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={rotulo} htmlFor="filtro-cluster">Cluster Produto</label>
          <select
            id="filtro-cluster"
            value={cluster}
            onChange={(e) => aoMudarCluster(e.target.value)}
            className={campo}
          >
            <option value="">Todos</option>
            {clusters.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="filtro-tipo">Tipo</label>
          <select
            id="filtro-tipo"
            value={tipo}
            onChange={(e) => aoMudarTipo(e.target.value)}
            className={campo}
          >
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{ROTULO_TIPO[t] ?? t}</option>
            ))}
          </select>
        </div>
      </div>

      <div ref={caixaRef} className="relative">
        <label className={rotulo} htmlFor="produto-busca">Produto</label>
        <input type="hidden" name={nomeCampo} value={selecionado?.id ?? valorInicial ?? ""} required />
        <input
          id="produto-busca"
          type="text"
          value={termo}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => setAberto(true)}
          placeholder={temFiltro ? "Digite pra refinar, ou escolha da lista" : "Digite o código ou a descrição do produto"}
          className={campo}
          autoComplete="off"
        />
        {aberto && (termo.trim().length >= 2 || temFiltro) && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {pending ? (
              <p className="p-3 text-sm text-slate-400">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="p-3 text-sm text-slate-400">Nenhum produto encontrado.</p>
            ) : (
              resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => escolher(p)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft"
                >
                  <span className="font-semibold text-slate-800">{p.codigo}</span>{" "}
                  <span className="text-slate-600">— {p.descricao}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
