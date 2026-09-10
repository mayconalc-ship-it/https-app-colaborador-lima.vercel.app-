// Confere cada tabela[coluna] citada em 07-medidas.dax contra modelo.js.
//
// validar.js confere os campos que os VISUAIS usam. Uma medida que cita
// uma coluna inexistente passa por ele: o visual referencia a medida, a
// medida existe -- e o Power BI so descobre na hora de calcular,
// mostrando "Erro Subjacente: Missing_References" no visual.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("C:/Projetos/app-colaborador-lima/bi/pbip/");
const { tabelas } = require("C:/Projetos/app-colaborador-lima/bi/pbip/modelo.js");

const colunasDe = new Map(
  tabelas.map((t) => [t.nome, new Set(t.colunas.split(/\s+/).map((c) => c.split(":")[0]))]),
);

const dax = readFileSync("C:/Projetos/app-colaborador-lima/bi/07-medidas.dax", "utf8");
const medidas = new Set([...dax.matchAll(/MEASURE\s+'_Medidas'\[([^\]]+)\]/g)].map((m) => m[1]));

// Quebra em blocos por medida para dizer ONDE esta a referencia quebrada.
const blocos = dax.split(/(?=^MEASURE\s)/m).filter((b) => b.startsWith("MEASURE"));
let erros = 0;
for (const b of blocos) {
  const nome = b.match(/\[([^\]]+)\]/)[1];
  // Sem comentarios: citacao em comentario nao e referencia.
  const corpo = b
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"[^"]*"/g, '""');
  for (const m of corpo.matchAll(/'?([A-Za-z_][\w]*)'?\s*\[([^\]]+)\]/g)) {
    const [, tab, col] = m;
    if (tab === "_Medidas") {
      if (!medidas.has(col)) { console.log(`  FALHA  [${nome}] cita medida inexistente [${col}]`); erros++; }
      continue;
    }
    if (!colunasDe.has(tab)) { console.log(`  FALHA  [${nome}] cita tabela inexistente ${tab}`); erros++; continue; }
    if (!colunasDe.get(tab).has(col)) { console.log(`  FALHA  [${nome}] cita coluna inexistente ${tab}[${col}]`); erros++; }
  }
  // Referencia a medida sem tabela: [Algo] sozinho.
  for (const m of corpo.matchAll(/(?<![\w'\]])\[([^\]]+)\]/g)) {
    const col = m[1];
    if (col.startsWith("@") || medidas.has(col)) continue;
    if (col === nome) continue;
    console.log(`  AVISO  [${nome}] cita [${col}] -- nao e medida conhecida (coluna de ADDCOLUMNS?)`);
  }
}
console.log(`\nMedidas conferidas: ${blocos.length}`);
console.log(erros === 0 ? "Referencias OK." : `${erros} referencia(s) quebrada(s).`);
process.exit(erros === 0 ? 0 : 1);
