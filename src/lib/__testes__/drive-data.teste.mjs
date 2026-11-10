// A data que a pasta do Drive mostra e a escolha do arquivo mais novo.
//   npx tsx src/lib/__testes__/drive-data.teste.mjs
import { dataDaPastaDoDrive, maisNovoPrimeiro } from "../drive-data.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const hoje = "2026-11-10";
eq("hora da tarde = hoje", dataDaPastaDoDrive("5:31 PM", hoje), "2026-11-10 17:31");
eq("meio-dia e meia-noite", [dataDaPastaDoDrive("12:05 PM", hoje), dataDaPastaDoDrive("12:05 AM", hoje)], ["2026-11-10 12:05", "2026-11-10 00:05"]);
eq("hora de 24h", dataDaPastaDoDrive("17:31", hoje), "2026-11-10 17:31");
eq("mês e dia neste ano", dataDaPastaDoDrive("Nov 8", hoje), "2026-11-08");
eq("dezembro visto em novembro é do ano passado", dataDaPastaDoDrive("Dec 20", hoje), "2025-12-20");
eq("com ano", dataDaPastaDoDrive("Nov 8, 2025", hoje), "2025-11-08");
eq("em português", dataDaPastaDoDrive("8 de nov.", hoje), "2026-11-08");
eq("curto mês/dia/ano", dataDaPastaDoDrive("11/8/25", hoje), "2025-11-08");
eq("texto estranho", dataDaPastaDoDrive("ontem", hoje), null);

const pasta = [
  { nome: "Cliente+.csv", modificado: "2026-11-10 17:21" },
  { nome: "base_antiga.xlsx", modificado: "2026-11-08" },
  { nome: "Bse_Cliente.csv", modificado: "2026-11-10 17:31" },
  { nome: "sem_data.csv", modificado: null },
];
eq("o mais novo primeiro, sem data no fim", maisNovoPrimeiro(pasta).map((a) => a.nome), ["Bse_Cliente.csv", "Cliente+.csv", "base_antiga.xlsx", "sem_data.csv"]);
eq("sem data nenhuma = ordem do Drive", maisNovoPrimeiro([{ nome: "b" }, { nome: "a" }]).map((a) => a.nome), ["b", "a"]);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
