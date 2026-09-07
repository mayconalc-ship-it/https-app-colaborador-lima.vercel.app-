import "server-only";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarBytesDoDrive, baixarTextoDoDrive, idDaPasta, listarArquivosDaPasta } from "@/lib/drive-pasta";
import {
  acharColunas,
  lerLinhaDeCliente,
  type ClienteDaBase,
} from "@/lib/clientes-base";

/**
 * O IMPORT DA BASE DE CLIENTES.
 *
 * A planilha tem ~10 MB e todas as informações do cliente. Duas decisões
 * seguram esse tamanho:
 *
 * 1. LEITURA EM FLUXO. `ExcelJS.stream.xlsx.WorkbookReader` percorre linha
 *    a linha sem montar a planilha inteira na memória. O `xlsx.load()` que
 *    o Rating usa carrega tudo de uma vez -- funciona no LOG.CO, que é
 *    pequeno, e derrubaria a função com 10 MB (um xlsx descompacta para
 *    várias vezes o próprio tamanho, e a Vercel corta por memória sem
 *    dizer por quê).
 *
 * 2. SÓ AS COLUNAS QUE O APP USA. Código, nome, telefone, cidade, bairro e
 *    endereço; o resto é descartado na leitura. Copiar a planilha inteira
 *    criaria uma segunda verdade sobre o cliente, que envelhece sozinha e
 *    ninguém sabe qual das duas vale.
 *
 * O DRIVE CONTINUA DONO DO DADO. Aqui é cópia, refeita a cada importação:
 * atualizar é trocar o arquivo lá e apertar o botão, como o dono pediu.
 */

/** Quantas linhas vão por vez ao banco. */
const LOTE = 500;

export type ResultadoDoImport = {
  ok: boolean;
  lidos: number;
  gravados: number;
  comTelefone: number;
  semCodigo: number;
  colunasAchadas: string[];
  erro?: string;
};

/**
 * Aceita link de ARQUIVO ou de PASTA.
 *
 * O dono disse que colocaria a planilha no Drive e colaria o link; qual
 * dos dois ele vai colar não dá para saber, e errar aqui devolve "não
 * consegui baixar" para um link que está perfeito. Pasta: pega o arquivo
 * mais recente que pareça a base.
 */
export function idDoArquivo(link: string): { arquivo?: string; pasta?: string } {
  const limpo = (link ?? "").trim();
  const doArquivo = limpo.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (doArquivo) return { arquivo: doArquivo[1] };
  const porParametro = limpo.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (porParametro) return { arquivo: porParametro[1] };
  const pasta = idDaPasta(limpo);
  if (pasta && /\/folders\//.test(limpo)) return { pasta };
  if (pasta) return { arquivo: pasta };
  return {};
}

const celula = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};

/** Lê um CSV simples (a exportação mais leve, e a que recomendamos). */
function lerCsv(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return { cabecalho: [], linhas: [] };
  // O separador é decidido pela linha de cabeçalho: exportação brasileira
  // sai com ";" e a internacional com ",". Chutar um deles faz a planilha
  // inteira virar uma coluna só -- e o import "funciona" trazendo zero.
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const partir = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  return { cabecalho: partir(linhas[0]), linhas: linhas.slice(1).map(partir) };
}

export async function importarBaseDeClientes(
  revendaId: string,
  link: string,
): Promise<ResultadoDoImport> {
  const vazio: ResultadoDoImport = {
    ok: false,
    lidos: 0,
    gravados: 0,
    comTelefone: 0,
    semCodigo: 0,
    colunasAchadas: [],
  };

  const { arquivo, pasta } = idDoArquivo(link);
  let arquivoId = arquivo ?? null;
  let ehCsv = false;

  if (!arquivoId && pasta) {
    const { arquivos, erro } = await listarArquivosDaPasta(pasta);
    if (erro) return { ...vazio, erro: `não consegui ler a pasta: ${erro}` };
    // O primeiro que o Drive lista, preferindo xlsx/csv -- a pasta da base
    // costuma ter um arquivo só.
    const escolhido = arquivos[0];
    if (!escolhido) return { ...vazio, erro: "a pasta está vazia" };
    arquivoId = escolhido.id;
    ehCsv = /\.csv$/i.test(escolhido.nome);
  }
  if (!arquivoId) {
    return { ...vazio, erro: "não reconheci o link. Cole o link do arquivo ou da pasta no Drive." };
  }

  let colunas: Partial<Record<keyof ClienteDaBase, number>> = {};
  const clientes = new Map<string, ClienteDaBase>();
  let lidos = 0;
  let semCodigo = 0;

  const guardar = (valores: unknown[]) => {
    lidos++;
    const c = lerLinhaDeCliente(valores, colunas);
    if (!c) {
      semCodigo++;
      return;
    }
    // O MESMO CÓDIGO DUAS VEZES: fica o último. A base traz o cliente
    // repetido quando ele tem mais de um endereço de entrega, e a linha
    // mais abaixo costuma ser a mais recente.
    clientes.set(c.codPdv, c);
  };

  try {
    if (ehCsv) {
      const texto = await baixarTextoDoDrive(arquivoId);
      if (!texto) return { ...vazio, erro: "não consegui baixar (o arquivo está compartilhado?)" };
      const { cabecalho, linhas } = lerCsv(texto);
      colunas = acharColunas(cabecalho);
      if (colunas.codPdv === undefined) {
        return { ...vazio, erro: "não achei a coluna do código do cliente no cabeçalho." };
      }
      for (const l of linhas) guardar(l);
    } else {
      const bytes = await baixarBytesDoDrive(arquivoId);
      if (!bytes) return { ...vazio, erro: "não consegui baixar (o arquivo está compartilhado?)" };

      const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), {
        // Sem estilos e sem strings compartilhadas em memória: são eles que
        // pesam num arquivo grande, e nenhum dos dois muda o valor lido.
        worksheets: "emit",
        sharedStrings: "cache",
        styles: "ignore",
        entries: "ignore",
      });

      let primeira = true;
      for await (const planilha of leitor) {
        for await (const linha of planilha) {
          const valores = (linha.values as unknown[]).slice(1).map(celula);
          if (primeira) {
            primeira = false;
            colunas = acharColunas(valores as string[]);
            if (colunas.codPdv === undefined) {
              return { ...vazio, erro: "não achei a coluna do código do cliente no cabeçalho." };
            }
            continue;
          }
          guardar(valores);
        }
        // Só a primeira aba: a base vem numa aba só, e varrer as outras
        // (relatórios, gráficos) traria lixo com cara de cliente.
        break;
      }
    }
  } catch (e) {
    return { ...vazio, erro: `não consegui ler a planilha: ${(e as Error).message}` };
  }

  const lista = [...clientes.values()];
  if (lista.length === 0) {
    return { ...vazio, lidos, semCodigo, erro: "nenhum cliente com código foi encontrado." };
  }

  const admin = createAdminClient();
  let gravados = 0;
  const agora = new Date().toISOString();

  for (let i = 0; i < lista.length; i += LOTE) {
    const { error } = await admin.from("pa_pdv_clientes").upsert(
      lista.slice(i, i + LOTE).map((c) => ({
        revenda_id: revendaId,
        cod_pdv: c.codPdv,
        nome: c.nome,
        telefone: c.telefone,
        cidade: c.cidade,
        bairro: c.bairro,
        endereco: c.endereco,
        atualizado_em: agora,
      })),
      { onConflict: "revenda_id,cod_pdv" },
    );
    // Um lote que falha não derruba os outros: numa base de milhares, uma
    // linha torta no meio não pode custar a importação inteira. O total
    // gravado aparece na tela, e a diferença denuncia o problema.
    if (!error) gravados += Math.min(LOTE, lista.length - i);
  }

  const comTelefone = lista.filter((c) => c.telefone).length;

  await admin.from("pa_pdv_config").upsert(
    {
      revenda_id: revendaId,
      clientes_link: link,
      clientes_importado_em: agora,
      clientes_total: gravados,
      atualizado_em: agora,
    },
    { onConflict: "revenda_id" },
  );

  return {
    ok: gravados > 0,
    lidos,
    gravados,
    comTelefone,
    semCodigo,
    colunasAchadas: Object.keys(colunas),
    erro: gravados < lista.length ? `${lista.length - gravados} cliente(s) não entraram.` : undefined,
  };
}

/** O telefone (e o nome) de um punhado de clientes, pelo código. */
export async function clientesPorCodigo(
  revendaId: string,
  codigos: string[],
): Promise<Map<string, { nome: string | null; telefone: string | null }>> {
  const saida = new Map<string, { nome: string | null; telefone: string | null }>();
  const lista = [...new Set(codigos)].filter(Boolean);
  if (lista.length === 0) return saida;

  const admin = createAdminClient();
  // Em páginas de 300: o `in` vai na URL, e uma lista grande estoura o
  // tamanho do cabeçalho antes de estourar qualquer outra coisa.
  for (let i = 0; i < lista.length; i += 300) {
    const { data } = await admin
      .from("pa_pdv_clientes")
      .select("cod_pdv, nome, telefone")
      .eq("revenda_id", revendaId)
      .in("cod_pdv", lista.slice(i, i + 300));
    for (const c of data ?? []) {
      saida.set(c.cod_pdv as string, {
        nome: (c.nome as string) ?? null,
        telefone: (c.telefone as string) ?? null,
      });
    }
  }
  return saida;
}

export type ConfigDoPdv = {
  clientesLink: string | null;
  importadoEm: string | null;
  total: number | null;
};

export async function configDoPdv(revendaId: string): Promise<ConfigDoPdv> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pa_pdv_config")
    .select("clientes_link, clientes_importado_em, clientes_total")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  return {
    clientesLink: (data?.clientes_link as string) ?? null,
    importadoEm: (data?.clientes_importado_em as string) ?? null,
    total: (data?.clientes_total as number) ?? null,
  };
}
