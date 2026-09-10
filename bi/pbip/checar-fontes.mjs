// Confere paginas.js contra modelo.js SEM gerar nada -- serve para
// quando o Power BI Desktop esta aberto e o gerador se recusa a rodar.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("C:/Projetos/app-colaborador-lima/bi/pbip/");
const { tabelas } = require("C:/Projetos/app-colaborador-lima/bi/pbip/modelo.js");
const { paginas } = require("C:/Projetos/app-colaborador-lima/bi/pbip/paginas.js");

const colunasDe = new Map();
for (const t of tabelas) {
  colunasDe.set(t.nome, new Set(t.colunas.split(/\s+/).map((c) => c.split(":")[0])));
}

const dax = readFileSync("C:/Projetos/app-colaborador-lima/bi/07-medidas.dax", "utf8");
const medidas = new Set([...dax.matchAll(/MEASURE\s+'_Medidas'\[([^\]]+)\]/g)].map((m) => m[1]));

const TIPOS = new Set([
  "cardVisual", "clusteredBarChart", "clusteredColumnChart", "columnChart",
  "lineChart", "pivotTable", "tableEx", "slicer", "textbox", "shape",
  "actionButton", "image", "pageNavigator",
]);

let erros = 0;
const falha = (m) => { console.log("  FALHA  " + m); erros++; };

const conferir = (ref, onde) => {
  if (typeof ref !== "string") return;
  const limpo = ref.replace(/#\w+$/, "");
  if (limpo.startsWith("@")) {
    if (!medidas.has(limpo.slice(1))) falha(`${onde}: medida inexistente "${limpo}"`);
    return;
  }
  const [tab, col] = limpo.split(".");
  if (!colunasDe.has(tab)) return falha(`${onde}: tabela inexistente "${tab}"`);
  if (!colunasDe.get(tab).has(col)) falha(`${onde}: coluna inexistente "${tab}.${col}"`);
};

for (const p of paginas) {
  for (const f of p.filtros || []) conferir(f.campo, `${p.nome} [filtro ${f.titulo}]`);
  for (const k of p.kpis || []) conferir(k[1], `${p.nome} [kpi ${k[0]}]`);
  for (const v of p.visuais || []) {
    if (v.t && !TIPOS.has(v.t)) falha(`${p.nome} [${v.titulo}]: tipo de visual desconhecido "${v.t}"`);
    for (const lista of Object.values(v.roles || {})) {
      for (const r of lista) conferir(r, `${p.nome} [${v.titulo}]`);
    }
    if (v.ordem) conferir(v.ordem.campo, `${p.nome} [${v.titulo} ordem]`);
    if (v.corteMinimo) conferir(v.corteMinimo.campo, `${p.nome} [${v.titulo} corte]`);
  }
}

console.log(`\nPaginas ..... ${paginas.length}`);
console.log(`Tabelas ..... ${tabelas.length}`);
console.log(`Medidas ..... ${medidas.size}`);
console.log(erros === 0 ? "\nFontes OK." : `\n${erros} problema(s) NAS FONTES.`);
process.exit(erros === 0 ? 0 : 1);
