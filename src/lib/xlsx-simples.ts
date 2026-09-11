import JSZip from "jszip";

/**
 * LEITOR PRÓPRIO DE .XLSX -- para quando o ExcelJS não abre.
 *
 * Nasceu com os LOG.CO de Barreiras de 01 a 05/2026 (11/09/2026). São
 * planilhas geradas por sistema (.NET Open XML SDK), e três coisas nelas
 * derrubavam o ExcelJS -- 18.813 avaliações ficavam de fora da importação:
 *
 *   - o índice aponta "/xl/workbook.xml", com barra na frente;
 *   - toda tag tem prefixo de namespace (<x:row>, <x:c>);
 *   - linhas e células vêm SEM número (sem r="5", sem r="C5") -- valem
 *     pela ordem em que aparecem. O Excel sempre grava; esse sistema não.
 *
 * Conferido contra o ExcelJS nos meses que ele abre (06 a 09/2026): as
 * mesmas 12.598 linhas, célula a célula.
 *
 * Lê só a PRIMEIRA aba e devolve textos: texto dentro da célula
 * (inlineStr), texto compartilhado (sharedStrings), número e data --
 * número com estilo de data vira AAAA-MM-DD, igual ao que o importador já
 * recebia do ExcelJS. Fórmula vale pelo resultado gravado.
 */
export async function lerXlsxSimples(bytes: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);
  const nomes = Object.keys(zip.files);

  const primeiraAba = nomes.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n)).sort()[0];
  if (!primeiraAba) return [];

  const compartilhados: string[] = [];
  const sst = zip.file("xl/sharedStrings.xml");
  if (sst) {
    for (const m of semPrefixo(await sst.async("string")).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      compartilhados.push(textoDe(m[1]));
    }
  }

  const estiloEhData = await estilosDeData(zip);

  const xml = semPrefixo(await zip.file(primeiraAba)!.async("string"));
  const linhas: string[][] = [];

  for (const mLinha of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celulas: string[] = [];
    let posicao = 0;

    for (const mC of (mLinha[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mC[1];
      // Com referência, vale a coluna dela (o Excel pula célula vazia);
      // sem referência, vale a ordem.
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const coluna = ref ? indiceDaColuna(ref) : posicao;
      posicao = coluna + 1;

      const tipo = attrs.match(/\bt="(\w+)"/)?.[1];
      const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
      const corpo = mC[2] ?? "";
      const v = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];

      let valor = "";
      if (tipo === "inlineStr") valor = textoDe(corpo);
      else if (tipo === "s") valor = compartilhados[Number(v)] ?? "";
      else if (v !== undefined) {
        valor = desescapar(v);
        if (tipo !== "str" && tipo !== "b" && estiloEhData[estilo] && /^\d+(\.\d+)?$/.test(valor)) {
          valor = serialParaIso(Number(valor));
        }
      }
      celulas[coluna] = valor.trim();
    }

    linhas.push(Array.from(celulas, (c) => c ?? ""));
  }

  return linhas;
}

/** <x:row> vira <row>: o sistema de Barreiras prefixa toda tag. */
function semPrefixo(xml: string) {
  return xml.replace(/<(\/?)[A-Za-z]\w*:/g, "<$1");
}

function desescapar(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** O texto de uma célula ou de um item compartilhado -- pode vir em pedaços (<r><t>). */
function textoDe(trecho: string) {
  return [...trecho.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1])).join("");
}

/** "C" -> 2, "AA" -> 26. */
function indiceDaColuna(letras: string) {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Número serial do Excel (sistema 1900) -> AAAA-MM-DD, sem fuso. */
export function serialParaIso(serial: number) {
  return new Date(Math.round((serial - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

/**
 * Quais estilos de célula são data. Os formatos embutidos de data são os
 * de número 14 a 22 e 45 a 47; um formato próprio é data quando tem d ou
 * y fora de aspas e não é só hora.
 */
async function estilosDeData(zip: JSZip): Promise<boolean[]> {
  const arquivo = zip.file("xl/styles.xml");
  if (!arquivo) return [];
  const xml = semPrefixo(await arquivo.async("string"));

  const proprios = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    proprios.set(Number(m[1]), m[2]);
  }

  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const saida: boolean[] = [];
  for (const m of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const id = Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    const proprio = proprios.get(id);
    const semTexto = (proprio ?? "").replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    saida.push((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (!!proprio && /[dy]/i.test(semTexto)));
  }
  return saida;
}
