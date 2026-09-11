import "server-only";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarBytesDoDrive, baixarTextoDoDrive, listarArquivosDaPasta } from "@/lib/drive-pasta";
import {
  acharColunas,
  idDoLinkDoDrive,
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
  /** A frase que fica gravada na fonte e vai para a tela. */
  resumo?: string;
  erro?: string;
};

/**
 * Aceita link de ARQUIVO, de PLANILHA DO GOOGLE ou de PASTA.
 *
 * TRÊS FORMAS PORQUE SÃO TRÊS LINKS DIFERENTES, e quem cola não tem por
 * que saber disso. O arquivo enviado ao Drive sai como `/file/d/ID`; a
 * planilha aberta no Google Sheets sai como
 * `docs.google.com/spreadsheets/d/ID` -- endereço de download totalmente
 * diferente --; e a pasta, como `/folders/ID`. Recusar dois deles devolve
 * "não consegui baixar" para um link que está perfeito.
 */
export const idDoArquivo = idDoLinkDoDrive;

/** A planilha do Google, exportada como CSV. É o único caminho que
 *  funciona para ela: o download de arquivo devolve a página do editor. */
async function baixarPlanilhaGoogle(id: string): Promise<string | null> {
  for (const url of [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
  ]) {
    try {
      const r = await fetch(url, { cache: "no-store", redirect: "follow" });
      if (!r.ok) continue;
      const texto = await r.text();
      // Página de login em vez do CSV: o arquivo não está público.
      if (texto.trimStart().startsWith("<")) continue;
      return texto;
    } catch {
      // tenta o próximo endereço
    }
  }
  return null;
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

  const { arquivo, planilhaGoogle, pasta } = idDoArquivo(link);
  let arquivoId = arquivo ?? null;

  if (!arquivoId && !planilhaGoogle && pasta) {
    const { arquivos, erro } = await listarArquivosDaPasta(pasta);
    /*
      A LEITURA DE PASTA É O CAMINHO FRÁGIL, e o erro precisa dizer isso.

      Ela não usa API: abre a página da pasta como um navegador abriria e
      procura os arquivos dentro do HTML do Google -- formato que não é
      documentado e muda sem aviso. Quando falha, a mensagem antiga mandava
      conferir o compartilhamento, e a pessoa ficava conferindo uma pasta
      que já estava pública.

      O link do ARQUIVO não passa por esse HTML. É o caminho curto, e agora
      é o que a mensagem manda usar.
    */
    if (erro) {
      return {
        ...vazio,
        erro:
          `não consegui ler a pasta (${erro}). ` +
          "Cole o link do PRÓPRIO ARQUIVO em vez do da pasta: abra a planilha no Drive, " +
          "Compartilhar › Copiar link.",
      };
    }
    const escolhido = arquivos[0];
    if (!escolhido) return { ...vazio, erro: "a pasta está vazia" };
    arquivoId = escolhido.id;
  }
  if (!arquivoId && !planilhaGoogle) {
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

  /*
    O FORMATO É DECIDIDO PELO CONTEÚDO, não pelo nome do arquivo.

    O nome só existe quando o link é de pasta -- e mesmo lá ele mente: o
    Drive guarda ".csv" em arquivo que virou planilha do Google e vice-
    versa. Decidir pelo nome fazia um .csv apontado por link de arquivo cair
    no leitor de xlsx e morrer com "não consegui ler a planilha", que não
    diz nada a quem colou um CSV perfeito.

    `baixarBytesDoDrive` já faz a checagem certa: só devolve quando os dois
    primeiros bytes são "PK", a assinatura do zip que todo xlsx é. Não sendo
    zip, é texto -- e aí é CSV.
  */
  let texto: string | null = null;
  let bytes: Buffer | null = null;

  if (planilhaGoogle) {
    texto = await baixarPlanilhaGoogle(planilhaGoogle);
    if (!texto) {
      return {
        ...vazio,
        erro:
          "não consegui baixar a planilha do Google. Em Compartilhar, deixe como " +
          "'Qualquer pessoa com o link'.",
      };
    }
  } else {
    bytes = await baixarBytesDoDrive(arquivoId!);
    if (!bytes) {
      texto = await baixarTextoDoDrive(arquivoId!);
      if (!texto) {
        return {
          ...vazio,
          erro:
            "não consegui baixar o arquivo. Em Compartilhar, deixe como " +
            "'Qualquer pessoa com o link'.",
        };
      }
    }
  }

  try {
    if (texto !== null) {
      const { cabecalho, linhas } = lerCsv(texto);
      colunas = acharColunas(cabecalho);
      if (colunas.codPdv === undefined) {
        return {
          ...vazio,
          erro: `não achei a coluna do código do cliente. O cabeçalho lido foi: ${cabecalho
            .slice(0, 12)
            .join(" | ")}`,
        };
      }
      for (const l of linhas) guardar(l);
    } else {
      const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes!), {
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
              // O cabeçalho lido vai na mensagem: "não achei a coluna" sem
              // dizer o que achou obriga a adivinhar se o problema é o nome
              // da coluna, a aba errada ou uma linha em branco no topo.
              return {
                ...vazio,
                erro: `não achei a coluna do código do cliente. O cabeçalho lido foi: ${(
                  valores as string[]
                )
                  .slice(0, 12)
                  .join(" | ")}`,
              };
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
        fantasia: c.fantasia,
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
  const resultado = resumoDoImport({ gravados, comTelefone, semCodigo, colunas: Object.keys(colunas) });

  await admin.from("pa_pdv_config").upsert(
    {
      revenda_id: revendaId,
      pasta_link: link,
      ultima_sincronizacao: agora,
      ultimo_resultado: resultado,
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
    resumo: resultado,
    erro: gravados < lista.length ? `${lista.length - gravados} cliente(s) não entraram.` : undefined,
  };
}

/**
 * A FRASE QUE FICA GRAVADA e aparece no cartão da fonte.
 *
 * Uma só, montada num lugar só: a tela de Fontes mostra o
 * `ultimo_resultado` do banco e a tela do módulo mostra a mensagem do
 * redirect. Se fossem dois textos, um dia diriam coisas diferentes sobre a
 * mesma importação.
 *
 * "Importado com sucesso" numa base sem a coluna de telefone é a pior
 * resposta possível: tudo parece certo e o botão do WhatsApp continua
 * abrindo o seletor de contato para todo mundo. Por isso o zero tem aviso
 * próprio.
 */
export function resumoDoImport(d: {
  gravados: number;
  comTelefone: number;
  semCodigo: number;
  colunas: string[];
}): string {
  const semTelefone = d.gravados - d.comTelefone;
  return (
    `${d.gravados} cliente(s) na base, ${d.comTelefone} com telefone` +
    (semTelefone > 0 ? ` e ${semTelefone} sem` : "") +
    (d.semCodigo > 0 ? `. ${d.semCodigo} linha(s) ignorada(s) por não terem código` : "") +
    `. Colunas achadas: ${d.colunas.join(", ") || "nenhuma"}.` +
    (d.comTelefone === 0
      ? " ⚠️ Nenhum telefone entrou — confira se a planilha tem uma coluna Celular ou Telefone."
      : "")
  );
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
