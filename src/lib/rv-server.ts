import "server-only";

import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import {
  buscarLinhasDoColaborador,
  chaveCompetencia,
  lerCsv,
  resolverOrigem,
  type LinhaRV,
} from "@/lib/rv";

export type ResultadoRV = {
  encontrados: LinhaRV[];
  configurado: boolean;
  falhas: { rotulo: string; motivo: string }[];
};

/** Converte a primeira aba de um .xlsx numa matriz de textos. */
export async function lerXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const aba = workbook.worksheets[0];
  if (!aba) return [];

  const linhas: string[][] = [];

  aba.eachRow({ includeEmpty: false }, (row) => {
    const celulas: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      celulas[col - 1] = textoDaCelula(cell.value);
    });
    for (let i = 0; i < celulas.length; i++) {
      if (celulas[i] === undefined) celulas[i] = "";
    }
    linhas.push(celulas);
  });

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (valor instanceof Date) {
    return valor.toLocaleDateString("pt-BR");
  }
  if (typeof valor === "object") {
    const obj = valor as unknown as Record<string, unknown>;
    // Celula com formula: interessa o resultado, nao a formula
    if ("result" in obj) return textoDaCelula(obj.result as ExcelJS.CellValue);
    if ("text" in obj) return String(obj.text).trim();
    if ("richText" in obj) {
      return (obj.richText as { text: string }[])
        .map((p) => p.text)
        .join("")
        .trim();
    }
    if ("hyperlink" in obj) return String(obj.text ?? "").trim();
  }
  return String(valor).trim();
}

function explicarStatus(status: number) {
  if (status === 404) return "arquivo não encontrado (confira o link)";
  if (status === 403 || status === 401) {
    return "sem permissão de acesso — compartilhe como 'Qualquer pessoa com o link'";
  }
  if (status === 400) {
    return "o Google recusou o download — normalmente é porque o arquivo não está compartilhado como 'Qualquer pessoa com o link'";
  }
  return `o Google respondeu ${status}`;
}

/** Baixa a planilha e devolve as celulas como matriz de textos. */
export async function baixarPlanilha(csvUrl: string): Promise<string[][]> {
  const origem = resolverOrigem(csvUrl);
  if (!origem) throw new Error("link inválido");

  const problemas: string[] = [];

  for (const candidato of origem.candidatos) {
    let resposta: Response;
    try {
      // no-store: a planilha e a fonte viva, nao pode servir cache
      resposta = await fetch(candidato, { cache: "no-store" });
    } catch (e) {
      problemas.push((e as Error).message);
      continue;
    }

    if (!resposta.ok) {
      problemas.push(explicarStatus(resposta.status));
      continue;
    }

    const buffer = await resposta.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // .xlsx e um zip: sempre comeca com "PK"
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return lerXlsx(buffer);
    }

    const texto = new TextDecoder("utf-8").decode(bytes);

    if (texto.trimStart().startsWith("<")) {
      problemas.push(
        texto.includes("accounts.google.com") || texto.includes("Sign in")
          ? "o Google pediu login — o arquivo não está público"
          : "veio uma página em vez da planilha",
      );
      continue;
    }

    return lerCsv(texto);
  }

  throw new Error(problemas[0] ?? "não foi possível baixar a planilha");
}

/**
 * Le as planilhas e devolve APENAS as linhas do CPF informado.
 * Roda exclusivamente no servidor: o link nunca chega ao navegador, senao
 * qualquer colaborador veria a RV de todos.
 */
export async function buscarRVdoColaborador(cpf: string): Promise<ResultadoRV> {
  const admin = createAdminClient();

  // Só as planilhas da revenda de quem está pedindo. Sem este filtro o app
  // procuraria o CPF também na planilha da outra unidade -- e um CPF que
  // aparecesse nas duas devolveria valores que não são daquela operação.
  const revendaId = await getRevendaId();
  if (!revendaId) return { encontrados: [], configurado: false, falhas: [] };

  const { data: configs } = await admin
    .from("rv_config")
    .select("area, rotulo, csv_url, coluna_cpf, coluna_valor")
    .eq("revenda_id", revendaId)
    .order("area", { ascending: true });

  const ativas = (configs ?? []).filter((c) => c.csv_url?.trim());

  if (ativas.length === 0) {
    return { encontrados: [], configurado: false, falhas: [] };
  }

  const encontrados: LinhaRV[] = [];
  const falhas: { rotulo: string; motivo: string }[] = [];

  for (const config of ativas) {
    try {
      const linhas = await baixarPlanilha(config.csv_url!);
      const { linhas: doColaborador } = buscarLinhasDoColaborador(
        linhas,
        cpf,
        config.coluna_cpf,
        config.coluna_valor,
      );

      for (const linha of doColaborador) {
        encontrados.push({
          area: config.area,
          rotulo: config.rotulo,
          competencia: linha.competencia,
          nome: linha.nome,
          valor: linha.valor,
          detalhes: linha.detalhes,
        });
      }
    } catch (e) {
      falhas.push({ rotulo: config.rotulo, motivo: (e as Error).message });
    }
  }

  encontrados.sort(
    (a, b) =>
      chaveCompetencia(b.competencia ?? "") -
      chaveCompetencia(a.competencia ?? ""),
  );

  return { encontrados, configurado: true, falhas };
}
