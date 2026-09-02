"use client";

import { useState } from "react";
import { montarCsv, nomeDoArquivo, type CelulaCsv } from "@/lib/csv";

/**
 * "Exportar .csv" -- e o arquivo é EXATAMENTE o que está na tela.
 *
 * O caminho óbvio seria um endereço /csv que refizesse as consultas do
 * painel. Foi descartado: a planilha e a tela passariam a ter dois donos,
 * e no dia em que um filtro mudasse de lugar só um dos dois mudaria
 * junto. Um export que discorda da tela é pior que não ter export --
 * ninguém confere linha a linha, e a decisão sai do número errado.
 *
 * Aqui as linhas chegam prontas do componente de servidor, já filtradas e
 * ordenadas pelo mesmo código que desenhou a tela. Não há segunda
 * consulta, não há segunda regra, e o que a pessoa filtrou é o que ela
 * baixa.
 *
 * O download é montado no navegador (Blob + link temporário) porque o
 * dado já está aqui: mandar o mesmo conteúdo de volta ao servidor só para
 * ele devolver como arquivo seria uma ida e volta sem função.
 */
export function ExportarCsv({
  nome,
  cabecalho,
  linhas,
  complemento,
  rotulo = "Exportar .csv",
}: {
  /** Base do nome do arquivo, sem extensão. Ex.: "uso-do-app". */
  nome: string;
  cabecalho: string[];
  linhas: CelulaCsv[][];
  /** Vai para o nome do arquivo -- em geral o filtro. Ex.: "90-dias". */
  complemento?: string;
  rotulo?: string;
}) {
  const [baixado, setBaixado] = useState(false);

  const vazio = linhas.length === 0;

  function baixar() {
    const conteudo = montarCsv(cabecalho, linhas);
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = nomeDoArquivo(nome, complemento);
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Sem isto o blob fica na memória da aba até ela fechar. Numa tela que
    // a pessoa exporta várias vezes seguidas, isso vai somando.
    URL.revokeObjectURL(url);

    setBaixado(true);
    window.setTimeout(() => setBaixado(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={vazio}
      title={
        vazio
          ? "Não há linhas para exportar com este filtro."
          : `Baixa as ${linhas.length} linha(s) desta tela, do jeito que estão filtradas.`
      }
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {baixado ? "✅ Baixado" : `⬇️ ${rotulo}`}
      {!vazio && (
        <span className="text-xs font-normal tabular-nums text-slate-400">
          {linhas.length}
        </span>
      )}
    </button>
  );
}
