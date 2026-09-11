import "server-only";

import ExcelJS from "exceljs";
import { baixarBytesDoDrive } from "@/lib/drive-pasta";
import { lerXlsxSimples } from "@/lib/xlsx-simples";
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

  const matriz = await matrizDaPlanilha(bytes);
  if ("erro" in matriz) return { avaliacoes: [], ignoradas: 0, erro: matriz.erro };

  const [cabecalho = [], ...resto] = matriz.linhas;
  const linhas: LinhaPlanilha[] = [];
  for (const celulas of resto) {
    const linha: LinhaPlanilha = {};
    let temAlgo = false;
    cabecalho.forEach((nome, i) => {
      if (!nome) return;
      const valor = celulas[i] ?? "";
      linha[nome] = valor;
      if (valor) temAlgo = true;
    });
    if (temAlgo) linhas.push(linha);
  }

  return lerAvaliacoes(linhas);
}

/**
 * A primeira aba como matriz de textos -- linha 1 é o cabeçalho.
 *
 * O ExcelJS continua sendo o caminho normal: é por ele que São Félix
 * sempre entrou, e nada muda para esses arquivos. Só quando ele não abre
 * entra o leitor próprio (lib/xlsx-simples) -- foi o caso dos LOG.CO de
 * Barreiras de 01 a 05/2026, gerados por sistema, em 11/09/2026.
 */
async function matrizDaPlanilha(bytes: Buffer): Promise<{ linhas: string[][] } | { erro: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch (e) {
    try {
      const linhas = await lerXlsxSimples(bytes);
      if (linhas.length > 0) return { linhas };
    } catch {
      // cai no erro do ExcelJS, que é o mais informativo
    }
    return { erro: `não consegui abrir a planilha: ${(e as Error).message}` };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { erro: "a planilha não tem nenhuma aba" };

  const linhas: string[][] = [];
  for (let n = 1; n <= ws.rowCount; n++) {
    const celulas: string[] = [];
    for (let i = 1; i <= ws.columnCount; i++) celulas.push(valorDaCelula(ws.getRow(n).getCell(i)));
    linhas.push(celulas);
  }
  return { linhas };
}

/**
 * Lê uma tabela INTEIRA, em páginas.
 *
 * O PostgREST devolve no máximo 1.000 linhas por chamada e NÃO avisa que
 * cortou -- vem uma lista curta, sem erro nenhum. Custou caro: a primeira
 * importação leu só as 1.000 primeiras das 3.651 viagens, e 90% das
 * avaliações ficaram sem dono. Janeiro e fevereiro funcionaram (estavam
 * entre as 1.000 primeiras) e o resto do ano não -- o que fez o problema
 * parecer buraco nos relatórios, em vez de limite de leitura.
 *
 * Qualquer consulta que possa passar de 1.000 linhas tem que vir por aqui.
 */
export async function lerTudoEmPaginas<T>(
  buscarPagina: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanho = 1000,
): Promise<{ linhas: T[]; erro?: string }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await buscarPagina(de, de + tamanho - 1);
    if (error) return { linhas, erro: error.message };
    if (!data || data.length === 0) break;
    linhas.push(...data);
    if (data.length < tamanho) break;
  }
  return { linhas };
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
