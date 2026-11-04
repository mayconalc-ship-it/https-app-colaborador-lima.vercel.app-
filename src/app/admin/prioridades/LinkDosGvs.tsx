"use client";

import { useState } from "react";

const botao = "rounded-lg border border-primary bg-white px-3 py-2 text-sm font-semibold text-primary-dark hover:bg-primary-soft";

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * O link das prioridades para o grupo dos GVs.
 *
 * O endereço é montado no navegador (window.location.origin), como o da
 * votação: o servidor não sabe por qual domínio a pessoa entrou, e um
 * link com o domínio errado não abre no celular de ninguém.
 */
export function LinkDosGvs({ token, revendaNome }: { token: string; revendaNome: string }) {
  const [copiado, setCopiado] = useState<"link" | "recado" | null>(null);
  const url = typeof window === "undefined" ? `/prioridade/${token}` : `${window.location.origin}/prioridade/${token}`;
  const recado = `Pessoal, as prioridades de entrega da ${revendaNome} agora vão por este link: ${url}\n\nÉ só colocar o código do PDV e o motivo, incluir quantos precisar e enviar tudo de uma vez. A lista fica salva no celular até vocês enviarem.`;

  async function copiar(texto: string, qual: "link" | "recado") {
    if (await copiarTexto(texto)) {
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2500);
    } else setCopiado(null);
  }

  return (
    <div className="space-y-2">
      <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-600">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copiar(url, "link")} className={botao}>
          {copiado === "link" ? "Link copiado" : "Copiar o link"}
        </button>
        <button type="button" onClick={() => copiar(recado, "recado")} className={botao}>
          {copiado === "recado" ? "Recado copiado" : "Copiar recado para o grupo"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(recado)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Mandar no WhatsApp
        </a>
      </div>
    </div>
  );
}

/**
 * O endereço que o Gestor LOG busca (04/11/2026): o que os GVs lançam no
 * link chega sozinho na sub-aba Prioridades. Não vai para o grupo: com ele
 * dá para LER a lista inteira.
 */
export function EnderecoGestorLog({ chave }: { chave: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = typeof window === "undefined" ? `/api/prioridades/${chave}` : `${window.location.origin}/api/prioridades/${chave}`;

  async function copiar() {
    if (await copiarTexto(url)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  }

  return (
    <div className="space-y-2">
      <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-600">{url}</p>
      <button type="button" onClick={copiar} className={botao}>
        {copiado ? "Endereço copiado" : "Copiar o endereço"}
      </button>
    </div>
  );
}
