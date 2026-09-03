"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarProdutos } from "@/app/admin/produtividade-armazem/actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Produto = { id: string; codigo: string; descricao: string };

/**
 * Campo de produto com busca -- compartilhado por Recebimento (base com
 * dezenas de milhares de códigos) e Reepack/Despejo (base bem menor, só
 * os produtos prontos). Um `<select>` com a base inteira travaria o
 * navegador, então digita, espera meio segundo de silêncio, busca no
 * servidor (limitada a 20 resultados) e mostra a lista pra escolher. O
 * `produto_id` de verdade vai num campo escondido; o texto visível é só
 * o rótulo escolhido. `buscar` decide QUAL base pesquisar -- por padrão,
 * a base inteira de Recebimento.
 */
export function ComboboxProduto({
  nomeCampo = "produto_id",
  buscar = buscarProdutos,
  placeholder = "Digite o código ou a descrição",
}: {
  nomeCampo?: string;
  buscar?: (termo: string) => Promise<Produto[]>;
  placeholder?: string;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [selecionado, setSelecionado] = useState<Produto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const visivelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  /*
    QUEM BARRA O ENVIO É O CAMPO VISÍVEL, não o escondido.

    O `required` do <input type="hidden"> abaixo NÃO faz nada: a
    especificação do HTML barra campo escondido da validação, e o
    navegador simplesmente o ignora. Durante meses o formulário deixou
    enviar sem produto escolhido.

    O estrago aparecia longe da causa. A pessoa DIGITAVA o código e não
    tocava na sugestão -- o campo fica com texto, parece preenchido --, o
    envio passava, e só o servidor recusava. Como a recusa é um redirect,
    ela voltava para um formulário VAZIO e perdia tudo o que tinha
    digitado. Relatado em 03/09/2026 numa conferência de carreta com 11
    itens; o conferente descreveu como "deu erro e voltou do zero".

    Quanto mais itens, mais provável: basta esquecer um toque em onze.

    Com o `setCustomValidity` no campo visível, o navegador barra o envio
    ANTES de sair da tela, rola até o campo culpado e mostra a mensagem
    nele. Nada se perde.
  */
  useEffect(() => {
    const campoVisivel = visivelRef.current;
    if (!campoVisivel) return;
    campoVisivel.setCustomValidity(
      selecionado ? "" : "Escolha o produto na lista que aparece ao digitar.",
    );
  }, [selecionado, termo]);

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
        const r = await buscar(valor);
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
      {/* Sem `required`: em campo escondido ele é inerte (ver acima). O
          que vale é o setCustomValidity no campo de baixo. */}
      <input type="hidden" name={nomeCampo} value={selecionado?.id ?? ""} />
      <input
        ref={visivelRef}
        type="text"
        value={termo}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        required
        className={`${campo} ${
          // Verde discreto quando a escolha está feita: é o sinal de que
          // aquele item está pronto, e numa lista de 11 é ele que diz
          // qual falta.
          selecionado ? "border-emerald-400 bg-emerald-50/40" : ""
        }`}
        autoComplete="off"
      />
      {termo.trim().length > 0 && !selecionado && !aberto && (
        <p className="mt-1 text-xs font-medium text-amber-700">
          ⚠️ Toque no produto na lista — só digitar não vale.
        </p>
      )}
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
