import "server-only";

import ExcelJS from "exceljs";
import { baixarBytesDoDrive } from "@/lib/drive-pasta";
import { lerAvaliacoes, type AvaliacaoLida, type LinhaPlanilha } from "@/lib/rating";

/**
 * Converte uma célula do exceljs em texto. Fórmula vira o resultado,
 * texto rico vira texto puro e data vira ISO -- sem isso, a coluna
 * "Data da Avaliação" chegaria como objeto Date e o parser (que é puro e
 * não conhece exceljs) não saberia o que fazer com ela.
 */
function valorDaCelula(celula: ExcelJS.Cell): string {
  let v: unknown = celula.value;
  if (v && typeof v === "object") {
    if ("richText" in v) {
      const partes = (v as { richText: { text?: unknown }[] }).richText;
      v = Array.isArray(partes) ? partes.map((p) => String(p?.text ?? "")).join("") : "";
    } else if ("text" in v) v = (v as { text: unknown }).text;
    else if ("result" in v) v = (v as { result: unknown }).result;
  }
  if (v instanceof Date) {
    // A planilha traz a data sem hora; usar toISOString direto jogaria
    // para o dia anterior em qualquer fuso a oeste de Greenwich.
    const ano = v.getUTCFullYear();
    const mes = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(v.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Baixa e lê uma planilha do LOG.CO. A leitura do .xlsx mora aqui, no
 * servidor, e não em lib/rating.ts: assim o parser continua sendo
 * função pura, testável sem depender do exceljs nem da rede.
 */
export async function lerPlanilhaLogCo(
  arquivoId: string,
): Promise<{ avaliacoes: AvaliacaoLida[]; ignoradas: number; erro?: string }> {
  const bytes = await baixarBytesDoDrive(arquivoId);
  if (!bytes) {
    return { avaliacoes: [], ignoradas: 0, erro: "não consegui baixar (o arquivo está compartilhado?)" };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch (e) {
    return { avaliacoes: [], ignoradas: 0, erro: `não consegui abrir a planilha: ${(e as Error).message}` };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { avaliacoes: [], ignoradas: 0, erro: "a planilha não tem nenhuma aba" };

  const cabecalho: string[] = [];
  for (let i = 1; i <= ws.columnCount; i++) cabecalho.push(valorDaCelula(ws.getRow(1).getCell(i)));

  const linhas: LinhaPlanilha[] = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const linha: LinhaPlanilha = {};
    let temAlgo = false;
    for (let i = 1; i <= ws.columnCount; i++) {
      const nome = cabecalho[i - 1];
      if (!nome) continue;
      const valor = valorDaCelula(ws.getRow(n).getCell(i));
      linha[nome] = valor;
      if (valor) temAlgo = true;
    }
    if (temAlgo) linhas.push(linha);
  }

  return lerAvaliacoes(linhas);
}

/**
 * Grava em lotes -- 14 mil linhas de uma vez estoura o limite do
 * PostgREST. Devolve a mensagem do primeiro erro, ou null se tudo entrou.
 *
 * `PromiseLike` e não `Promise` porque o builder do supabase-js é um
 * thenable, não uma Promise de verdade.
 */
export async function gravarEmLotes<T>(
  linhas: T[],
  tamanho: number,
  gravar: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<string | null> {
  for (let i = 0; i < linhas.length; i += tamanho) {
    const { error } = await gravar(linhas.slice(i, i + tamanho));
    if (error) return error.message;
  }
  return null;
}
