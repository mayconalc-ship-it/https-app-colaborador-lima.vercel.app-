"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarProdutos } from "@/app/admin/produtividade-armazem/actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Produto = { id: string; codigo: string; descricao: string };

/**
 * Campo de produto com busca -- a base tem dezenas de milhares de
 * códigos, e um `<select>` com todos eles trava o navegador e pesa a
 * página inteira. Digita, espera meio segundo de silêncio, busca no
 * servidor (`buscarProdutos`, limitada a 20 resultados) e mostra a
 * lista pra escolher. O `produto_id` de verdade vai num campo escondido;
 * o texto visível é só o rótulo escolhido.
 */
export function ComboboxProduto({ nomeCampo = "produto_id" }: { nomeCampo?: string }) {
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

  function aoDigitar(valor: string) {
    setTermo(valor);
    setSelecionado(null);
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    relogio.current = setTimeout(() => {
      startTransition(async () => {
        const r = await buscarProdutos(valor);
        setResultados(r);
      });
    }, 400);
  }

  function escolher(p: Produto) {
    setSelecionado(p);
    setTermo(`${p.codigo} — ${p.descricao}`);
    setAberto(false);
  }

  return (
    <div ref={caixaRef} className="relative">
      <input type="hidden" name={nomeCampo} value={selecionado?.id ?? ""} required />
      <input
        type="text"
        value={termo}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder="Digite o código ou a descrição"
        className={campo}
        autoComplete="off"
      />
      {aberto && termo.trim().length >= 2 && (
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
  );
}
