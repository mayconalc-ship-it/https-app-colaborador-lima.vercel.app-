/**
 * CSV que o Excel em português abre certo no duplo clique.
 *
 * Três detalhes decidem isso, e errar qualquer um joga a planilha inteira
 * na coluna A -- que é como quase todo "exportar CSV" chega ao usuário
 * brasileiro:
 *
 *   1. SEPARADOR ";". O Excel não lê o separador do arquivo: usa o da
 *      configuração regional, e em pt-BR é o ponto e vírgula, porque a
 *      vírgula já é a casa decimal. Vírgula como separador só funciona no
 *      Excel em inglês.
 *
 *   2. BOM no começo. Sem ele o Excel assume a codificação do Windows e
 *      "Produção" vira "ProduÃ§Ã£o". O BOM é o único jeito de dizer
 *      "isto é UTF-8" para um programa que não pergunta.
 *
 *   3. DECIMAL COM VÍRGULA. Um "12.5" exportado vira texto (ou 125) numa
 *      planilha pt-BR, e a soma da coluna dá errado sem avisar. Números
 *      passam por `formatarNumero` aqui, não por toFixed.
 *
 * Quebra de linha é CRLF, que é o que o Excel espera; o LibreOffice e o
 * Google Sheets aceitam os dois.
 */

export type CelulaCsv = string | number | boolean | null | undefined;

const SEPARADOR = ";";

/** Vírgula decimal, sem separador de milhar (milhar atrapalha a leitura de volta). */
export function numeroCsv(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toFixed(casas).replace(".", ",");
}

function escapar(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isInteger(valor) ? String(valor) : numeroCsv(valor);
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";

  const texto = String(valor);
  // Aspas, ponto e vírgula ou quebra de linha dentro da célula quebrariam
  // as colunas seguintes. A regra do formato: envolve em aspas e dobra as
  // aspas de dentro.
  if (/[";\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function montarCsv(cabecalho: string[], linhas: CelulaCsv[][]): string {
  const corpo = [cabecalho, ...linhas].map((linha) => linha.map(escapar).join(SEPARADOR));
  return `﻿${corpo.join("\r\n")}\r\n`;
}

/** Nome de arquivo com a data, para dois downloads não se sobrescreverem na pasta. */
export function nomeDoArquivo(base: string, extra?: string): string {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return [base, extra, hoje].filter(Boolean).join("-") + ".csv";
}

export function respostaCsv(conteudo: string, nome: string): Response {
  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      // Um painel filtrado é sempre uma pergunta nova. Cache aqui
      // devolveria a planilha do filtro anterior, e o erro seria mudo.
      "Cache-Control": "no-store",
    },
  });
}
