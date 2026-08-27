"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarProdutosReepack } from "@/app/admin/produtividade-armazem/actions";
import { COOKIE_REEPACK_CLUSTER, COOKIE_REEPACK_DIAS, COOKIE_REEPACK_PATH, COOKIE_REEPACK_TIPO } from "@/lib/produtividade-armazem";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Produto = { id: string; codigo: string; descricao: string };

const ROTULO_TIPO: Record<string, string> = {
  DESCARTAVEL: "Descartável",
  RETORNAVEL: "Retornável",
};

/**
 * Lê o MESMO cookie que o servidor já leu pra montar `inicial` -- os dois
 * lados precisam concordar (mesmo raciocínio de `combinacaoInicial` em
 * ativo-de-giro/FormContagem.tsx). Sem isto, o valor calculado aqui
 * dentro do useState(() => ...) divergiria do HTML que o servidor mandou
 * e o React "corrigiria" com um piscar visível.
 */
function valorDoCookie(nome: string, inicial: string): string {
  if (typeof document === "undefined") return inicial;
  const bruto = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${nome}=`))
    ?.slice(nome.length + 1);
  if (!bruto) return inicial;
  try {
    return decodeURIComponent(bruto);
  } catch {
    return inicial;
  }
}

/** Grava assim que a pessoa troca o seletor -- não só quando lança --
 *  pra sobreviver a um recarregamento no meio do caminho. */
function lembrarFiltro(nome: string, valor: string, caminho: string) {
  if (typeof document === "undefined") return;
  const idade = 60 * 60 * 24 * COOKIE_REEPACK_DIAS;
  document.cookie = `${nome}=${encodeURIComponent(valor)}; path=${caminho}; max-age=${idade}; samesite=lax`;
}

/**
 * Cluster → Tipo → Produto, pedido do dono (27/08/2026) pra achar produto
 * mais rápido numa base de centenas de itens. Os dois primeiros filtram o
 * terceiro: escolher só Cluster e Tipo já lista os produtos (sem precisar
 * digitar nada), e digitar dentro disso refina por nome ou código.
 *
 * O filtro sobrevive a iniciar/finalizar um reepack (a tela recarrega de
 * verdade, é uma Server Action) porque fica em cookie -- `clusterInicial`/
 * `tipoInicial` vêm do servidor (que já leu o mesmo cookie), e o estado
 * nasce deles em vez de num efeito, pro React não ter que "corrigir" a
 * tela visivelmente depois de montada.
 *
 * Fica em um componente à parte do ComboboxProduto genérico (usado por
 * Recebimento) de propósito -- aqui o `buscar` precisa reagir à troca dos
 * selects, não só à digitação, e misturar os dois comportamentos no
 * componente genérico complicaria quem só usa a busca simples.
 */
export function ComboboxProdutoReepack({
  clusters,
  tipos,
  clusterInicial = "",
  tipoInicial = "",
  valorInicial,
  nomeCampo = "produto_id",
  buscarProdutos = buscarProdutosReepack,
  cookiePath = COOKIE_REEPACK_PATH,
}: {
  clusters: string[];
  tipos: string[];
  clusterInicial?: string;
  tipoInicial?: string;
  valorInicial?: string;
  nomeCampo?: string;
  /** Qual base pesquisar. O Reepack só enxerga produto pronto para
   *  reembalar; o FEFO precisa da base inteira, porque a quebra acontece
   *  com qualquer SKU no estoque. */
  buscarProdutos?: (
    termo: string,
    filtros?: { cluster?: string; tipo?: string },
  ) => Promise<Produto[]>;
  /** O cookie do filtro é por tela: lembrar "Cerveja/Descartável" do
   *  Reepack não deve mandar na tela de FEFO. */
  cookiePath?: string;
}) {
  const [cluster, setCluster] = useState(() => {
    const v = valorDoCookie(COOKIE_REEPACK_CLUSTER, clusterInicial);
    return clusters.includes(v) ? v : "";
  });
  const [tipo, setTipo] = useState(() => {
    const v = valorDoCookie(COOKIE_REEPACK_TIPO, tipoInicial);
    return tipos.includes(v) ? v : "";
  });
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

  // O filtro já nasce certo (veio do cookie, acima) -- só falta buscar a
  // lista de produtos que ele aponta, uma vez, ao montar.
  useEffect(() => {
    if (cluster || tipo) buscar("", cluster, tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
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
      const r = await buscarProdutos(termoAtual, {
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
    lembrarFiltro(COOKIE_REEPACK_CLUSTER, valor, cookiePath);
  }

  function aoMudarTipo(valor: string) {
    setTipo(valor);
    setSelecionado(null);
    setAberto(true);
    buscar(termo, cluster, valor);
    lembrarFiltro(COOKIE_REEPACK_TIPO, valor, cookiePath);
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
