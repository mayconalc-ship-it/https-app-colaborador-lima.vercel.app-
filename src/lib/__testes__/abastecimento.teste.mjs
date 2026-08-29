// Confere a conta de HL contra produtos REAIS do cadastro, antes de ligar
// na tela. Rode: npx tsx src/lib/__testes__/abastecimento.teste.mjs
import {
  calcularHl,
  calcularPaletes,
  resumirAbastecimento,
  rankingDeSku,
  mediaHlPorDia,
} from "../abastecimento.ts";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = esperado === null ? obtido === null : Math.abs(obtido - esperado) < 0.005;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

// Produto 13486 do cadastro real: 0,06 HL/caixa, 150 caixas/palete.
const p13486 = { fatorHecto: 0.06, caixasPallet: 150 };
// Produto 25700: 0,12 HL/caixa, 100 caixas/palete.
const p25700 = { fatorHecto: 0.12, caixasPallet: 100 };

console.log("== HL POR UNIDADE (produtos reais do cadastro) ==");
conferir("30 caixas do 13486", calcularHl(30, "caixa", p13486), 1.8);
conferir("1 palete do 13486 = 150 cx", calcularHl(1, "palete", p13486), 9);
conferir("2 paletes do 25700", calcularHl(2, "palete", p25700), 24);
conferir("50 caixas do 25700", calcularHl(50, "caixa", p25700), 6);

console.log("\n== CADASTRO INCOMPLETO NAO VIRA ZERO ==");
conferir("sem fator_hecto", calcularHl(10, "caixa", { fatorHecto: null, caixasPallet: 100 }), null);
conferir("palete sem caixas_pallet", calcularHl(1, "palete", { fatorHecto: 0.06, caixasPallet: null }), null);
conferir("mas caixa sem caixas_pallet funciona", calcularHl(10, "caixa", { fatorHecto: 0.06, caixasPallet: null }), 0.6);
conferir("quantidade zero", calcularHl(0, "caixa", p13486), null);

console.log("\n== PALETES EQUIVALENTES ==");
conferir("1 palete = 1", calcularPaletes(1, "palete", p13486), 1);
conferir("75 caixas de um palete de 150 = 0,5", calcularPaletes(75, "caixa", p13486), 0.5);
conferir("caixa sem caixas_pallet nao inventa palete", calcularPaletes(10, "caixa", { fatorHecto: 0.06, caixasPallet: null }), 0);

console.log("\n== RESUMO DA SESSAO: 2h, 30 HL ==");
let r = resumirAbastecimento("2026-08-29T08:00:00-03:00", "2026-08-29T10:00:00-03:00", [
  { hl: 18, paletes: 2 },
  { hl: 12, paletes: 1.5 },
]);
conferir("minutos", r.minutos, 120);
conferir("HL total", r.hl, 30);
conferir("paletes", r.paletes, 3.5);
conferir("HL/h", r.hlPorHora, 15);
conferir("min por HL", r.minutosPorHl, 4);
conferir("itens", r.itens, 2);

console.log("\n== SESSAO SEM ITEM: nao divide por zero ==");
r = resumirAbastecimento("2026-08-29T08:00:00-03:00", "2026-08-29T09:00:00-03:00", []);
conferir("HL zero", r.hl, 0);
conferir("HL/h nulo em vez de zero", r.hlPorHora, null);
conferir("min por HL nulo", r.minutosPorHl, null);

console.log("\n== RANKING DE SKU ==");
const ranking = rankingDeSku([
  { produtoId: "a", abastecimentoId: "s1", hl: 10, paletes: 1 },
  { produtoId: "b", abastecimentoId: "s1", hl: 4, paletes: 0.5 },
  { produtoId: "a", abastecimentoId: "s2", hl: 5, paletes: 0.5 },
  { produtoId: "b", abastecimentoId: "s2", hl: 3, paletes: 0.4 },
  { produtoId: "b", abastecimentoId: "s3", hl: 2, paletes: 0.2 },
]);
conferir("A lidera em HL", ranking[0].hl, 15);
console.log(`  1o lugar: ${ranking[0].produtoId} (esperado: a)`);
conferir("A apareceu em 2 sessoes", ranking[0].sessoes, 2);
conferir("B soma 9 HL", ranking[1].hl, 9);
conferir("mas B apareceu em 3 sessoes (candidato a mudar de endereco)", ranking[1].sessoes, 3);

console.log("\n== MEDIA POR DIA: domingo parado nao derruba a media ==");
conferir(
  "3 dias com movimento, 60 HL",
  mediaHlPorDia([
    { dia: "2026-08-26", hl: 10 },
    { dia: "2026-08-26", hl: 10 },
    { dia: "2026-08-27", hl: 20 },
    { dia: "2026-08-28", hl: 20 },
  ]),
  20,
);
conferir("sem sessao nenhuma", mediaHlPorDia([]), null);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
