// Confere o leitor proprio de .xlsx (lib/xlsx-simples):
//   npx tsx src/lib/__testes__/xlsx-simples.teste.mjs
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { lerXlsxSimples, serialParaIso } from "../xlsx-simples.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  const bom = a === b;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${a}, esperado ${b}`}`);
}

console.log("== DATA DO EXCEL ==");
eq("46053 = 31/01/2026", serialParaIso(46053), "2026-01-31");
eq("45658 = 01/01/2025", serialParaIso(45658), "2025-01-01");

// ---------- 1. Do jeito do sistema de Barreiras ----------
// Barra na frente do caminho, prefixo x: em toda tag, linhas e celulas
// sem numero, texto dentro da celula, data como numero com estilo.
console.log("\n== PLANILHA DE SISTEMA (LOG.CO de Barreiras) ==");
const zip = new JSZip();
const X = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="officeDocument" Target="/xl/workbook.xml" Id="R1"/></Relationships>');
zip.file("xl/workbook.xml", `<x:workbook ${X}><x:sheets><x:sheet name="Export" sheetId="1" r:id="R2"/></x:sheets></x:workbook>`);
zip.file("xl/styles.xml", `<x:styleSheet ${X}><x:cellXfs count="2"><x:xf numFmtId="0"/><x:xf numFmtId="14" applyNumberFormat="1"/></x:cellXfs></x:styleSheet>`);
zip.file(
  "xl/worksheets/sheet1.xml",
  `﻿<?xml version="1.0" encoding="utf-8"?><x:worksheet ${X}><x:sheetData>` +
    `<x:row><x:c t="inlineStr"><x:is><x:t>Data da Avaliação</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>Avaliação</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>Motorista</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>Mapa</x:t></x:is></x:c></x:row>` +
    `<x:row><x:c s="1"><x:v>46053</x:v></x:c><x:c><x:v>1</x:v></x:c><x:c /><x:c t="inlineStr"><x:is><x:t>15461 &amp; cia</x:t></x:is></x:c></x:row>` +
    `</x:sheetData></x:worksheet>`,
);
const deSistema = await lerXlsxSimples(await zip.generateAsync({ type: "uint8array" }));
eq("cabecalho", deSistema[0], ["Data da Avaliação", "Avaliação", "Motorista", "Mapa"]);
eq("linha pela ordem, data convertida, vazio no lugar, &amp; desfeito", deSistema[1], ["2026-01-31", "1", "", "15461 & cia"]);

// ---------- 2. Gravada pelo proprio ExcelJS ----------
// Textos compartilhados, celulas com referencia e uma coluna pulada.
console.log("\n== PLANILHA DO EXCEL (gravada pelo ExcelJS) ==");
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Export");
ws.getCell("A1").value = "Data";
ws.getCell("B1").value = "Nota";
ws.getCell("D1").value = "Cidade";
ws.getCell("A2").value = new Date(Date.UTC(2026, 5, 27));
ws.getCell("B2").value = 5;
ws.getCell("D2").value = "Barreiras";
const doExcel = await lerXlsxSimples(new Uint8Array(await wb.xlsx.writeBuffer()));
eq("cabecalho com a coluna C vazia no lugar", doExcel[0], ["Data", "Nota", "", "Cidade"]);
eq("data do ExcelJS vira AAAA-MM-DD", doExcel[1], ["2026-06-27", "5", "", "Barreiras"]);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS CASOS PASSARAM");
if (falhas) process.exit(1);
