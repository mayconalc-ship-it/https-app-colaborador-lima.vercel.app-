// A escada da RV, nas duas planilhas. Os casos de Barreiras sao linhas
// reais de julho/2026 (motorista e ajudante): o TOTAL da escada tem de
// fechar com o TOTAL da folha, centavo a centavo.
//   npx tsx src/lib/__testes__/rv-contracheque.teste.mjs
import { montarMemoriaRV, ehColunaDoContracheque } from "../rv-contracheque.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  // O Intl separa "R$" do numero com espaco inquebravel: igual na tela, diferente no texto.
  const limpo = (v) => String(JSON.stringify(v)).replace(/\u00a0/g, " ");
  const bom = limpo(obtido) === limpo(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const linha = (pares) => pares.map(([rotulo, valor]) => ({ rotulo, valor: String(valor) }));
const passo = (m, rotulo) => m.passos.find((p) => p.rotulo === rotulo);
const r2 = (n) => Math.round(n * 100) / 100;
const somaDoContracheque = (m) => r2(m.passos.filter((p) => p.doContracheque).reduce((t, p) => t + p.valor, 0));

console.log("\nBARREIRAS - MOTORISTA (Adolfo, sem premio, com recarga)");
const adolfo = montarMemoriaRV(
  linha([
    ["Qtd Entregas", 205], ["% Devolução ", 0.04878048780487805], ["Qtd Caixas", 4837.8600000000015],
    ["Remuneração sem %", 870.8148000000002], ["Valor devolução", 0], ["RV C/ bonus devolução %", 870.8148000000002],
    ["Tempo de Empresa", 2.254794520547945], ["bonus tempo de casa", 43.540740000000014],
    ["Qtd Recarga", 8], ["Valor", 50], ["Valor recarga", 400], ["RATING", 5], ["TML", 0.54],
  ]),
  "1314.35554",
);
eq("modelo", adolfo.modelo, "barreiras");
eq("total e o da planilha", r2(adolfo.total), 1314.36);
eq("as 3 linhas do contracheque fecham com o total", somaDoContracheque(adolfo), 1314.36);
eq("produtividade = caixas + recarga", r2(passo(adolfo, "Produtividade").valor), 1270.81);

// A REDE: se a escada nao fecha com a folha (um numero lido errado), ela
// nao aparece -- melhor a tela simples do que uma conta que nao bate.
eq(
  "escada que nao fecha com o total nao aparece",
  montarMemoriaRV(linha([["Qtd Caixas", 1000], ["Remuneração sem %", 180], ["bonus tempo de casa", 9]]), "5000"),
  null,
);
eq("premio zerado", passo(adolfo, "Prêmio").valor, 0);
eq("tempo de casa", r2(passo(adolfo, "Tempo de casa").valor), 43.54);
eq("abs aparece mesmo sem desconto", passo(adolfo, "ABS").valor, 0);
eq("recarga detalhada", passo(adolfo, "+ Recarga").detalhe, "8 recargas × R$ 50,00");
eq("taxa por caixa de motorista", passo(adolfo, "Valor/Caixa").detalhe.replace(/\u00a0/g, " ").includes("R$ 0,18"), true);
eq("nota fala de 3 linhas", adolfo.nota.includes("3 linhas"), true);

console.log("\nBARREIRAS - MOTORISTA (Fabio, com premio)");
const fabio = montarMemoriaRV(
  linha([
    ["Qtd Caixas", 3333.31], ["Remuneração sem %", 599.9957999999999], ["Valor devolução", "R$120,00"],
    ["RV C/ bonus devolução %", 719.9957999999999], ["bonus tempo de casa", 29.999789999999997],
    ["Qtd Recarga", 1], ["Valor", 50], ["Valor recarga", 50],
  ]),
  "799.9955899999999",
);
eq("premio de 120", passo(fabio, "Prêmio").valor, 120);
eq("fecha com o total", somaDoContracheque(fabio), r2(799.9955899999999));

console.log("\nBARREIRAS - AJUDANTE (Marcelo, COM ABS)");
const marcelo = montarMemoriaRV(
  linha([
    ["Quantidade Caixas", 5691.77], ["Remuneração sem %", "569.17700000000002"], ["Valor Devolução", "90,00"], ["Check AbS", 2],
    ["Remuneração  com %", "540.71815000000004"], ["Tempo de casa", 2.254794520547945], ["bonus tempo de cas", 28.45885],
    ["Qtd Recarga", 1], ["Valor", 40], ["Valor recarga", 40],
  ]),
  "609.17700000000002",
);
eq("o premio nao entra", passo(marcelo, "Prêmio").valor, 0);
eq("abs tira 5% do valor/caixa", r2(passo(marcelo, "− ABS").valor), -28.46);
eq("abs diz os 5%", passo(marcelo, "− ABS").detalhe.includes("5% do Valor/Caixa"), true);
eq("abs diz o check", passo(marcelo, "− ABS").detalhe.includes("Check ABS: 2"), true);
eq("fecha com o total", somaDoContracheque(marcelo), 609.18);
eq("taxa por caixa de ajudante", passo(marcelo, "Valor/Caixa").detalhe.replace(/\u00a0/g, " ").includes("R$ 0,10"), true);

console.log("\nBARREIRAS - AJUDANTE (Edilson, sem recarga)");
const edilson = montarMemoriaRV(
  linha([
    ["Quantidade Caixas", 1280.87], ["Remuneração sem %", "128.08700000000002"], ["Valor Devolução", "0,00"],
    ["Remuneração  com %", "128.08700000000002"], ["bonus tempo de cas", 6.40435], ["Qtd Recarga", 0], ["Valor", 40], ["Valor recarga", 0],
  ]),
  "134.49135",
);
eq("sem degrau de recarga", passo(edilson, "+ Recarga"), undefined);
eq("fecha com o total", somaDoContracheque(edilson), 134.49);

console.log("\nCOLUNAS REPETIDAS NO DETALHAMENTO");
eq("barreiras esconde a recarga", ehColunaDoContracheque("Valor recarga", "barreiras"), true);
eq("barreiras esconde o valor da recarga", ehColunaDoContracheque("Valor", "barreiras"), true);
eq("barreiras mantem a % de devolucao", ehColunaDoContracheque("% Devolução ", "barreiras"), false);
eq("barreiras mantem Qtd Entregas", ehColunaDoContracheque("Qtd Entregas", "barreiras"), false);
eq("sao felix nao esconde 'Valor'", ehColunaDoContracheque("Valor"), false);

console.log("\nSAO FELIX (a escada de sempre)");
const sf = montarMemoriaRV(
  linha([
    ["Qt Caixas", 3000], ["RV s/ %", 540], ["Valor devolução", 100], ["RV  com  %", 567],
    ["Qt. Rec.", 1], ["Valor Rec", 50], ["TT-Devolução", 617], ["RV TT + 5% Tempo de Casa", 647.85],
  ]),
  "700",
);
eq("modelo", sf.modelo, "sao-felix");
eq("total = produtividade + premio", sf.total, 747.85);
eq("nota de 2 linhas", sf.nota.includes("2 linhas"), true);
eq("tem o degrau de 5% de ABS", !!passo(sf, "+ 5% de ABS"), true);

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
