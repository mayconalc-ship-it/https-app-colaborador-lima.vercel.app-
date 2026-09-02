// Bate palete. O que este teste guarda: cadastro incompleto NUNCA vira
// zero, a avaria e uma FRACAO do lote (nao uma pilha separada), e o
// percentual do produto soma antes de dividir.
//   npx tsx src/lib/__testes__/bate-palete.teste.mjs
import {
  calcularHl, pctAvaria, resumirBatePalete,
  avariaPorProduto, mediaHlPorDia, ehUnidadeBatePalete,
} from "../bate-palete.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Produto real do cadastro: 0,06 HL/caixa, 12 unidades por caixa.
const p = { fatorHecto: 0.06, unidadesPorCaixa: 12, caixasPallet: 150 };
const semFator = { fatorHecto: null, unidadesPorCaixa: 12, caixasPallet: 150 };
const semUnidades = { fatorHecto: 0.06, unidadesPorCaixa: null, caixasPallet: 150 };

console.log("== HL EM CAIXA E EM UNIDADE ==");
eq("30 caixas", calcularHl(30, "caixa", p), 1.8);
// Unidade passa por caixa: 24 garrafas = 2 caixas = 0,12 HL.
eq("24 unidades = 2 caixas", calcularHl(24, "unidade", p), 0.12);
eq("zero e zero, nao null", calcularHl(0, "caixa", p), 0);
// Sem o fator o item e RECUSADO na acao -- entrar valendo zero sumiria
// do total em silencio.
eq("sem fator_hecto e null", calcularHl(30, "caixa", semFator), null);
// Contar em unidade sem saber quantas cabem na caixa e impossivel.
eq("unidade sem unidades_por_caixa e null", calcularHl(24, "unidade", semUnidades), null);
eq("caixa NAO precisa de unidades_por_caixa", calcularHl(30, "caixa", semUnidades), 1.8);
eq("negativo e null", calcularHl(-1, "caixa", p), null);

console.log("\n== PERCENTUAL DE AVARIA ==");
eq("30 de 100", pctAvaria(100, 30), 30);
eq("lote inteiro perdido", pctAvaria(50, 50), 100);
eq("lote sem avaria", pctAvaria(100, 0), 0);
// Sem lote nao ha porcentagem -- e null, nao zero: zero afirmaria que o
// lote veio perfeito.
eq("sem lote e null", pctAvaria(0, 0), null);

console.log("\n== UNIDADE VALIDA ==");
eq("caixa", ehUnidadeBatePalete("caixa"), true);
eq("unidade", ehUnidadeBatePalete("unidade"), true);
eq("palete nao e mais unidade daqui", ehUnidadeBatePalete("palete"), false);
eq("lixo", ehUnidadeBatePalete(null), false);

console.log("\n== RESUMO DA SESSAO ==");
const T = (h) => `2026-09-03T${h}:00-03:00`;
const r = resumirBatePalete(T("08:00"), T("10:00"), [
  { hlBatido: 6, hlAvariado: 1.2 },
  { hlBatido: 4, hlAvariado: 0.8 },
]);
eq("lotes", r.lotes, 2);
eq("minutos", r.minutos, 120);
eq("HL batido", r.hlBatido, 10);
eq("HL avariado", r.hlAvariado, 2);
eq("HL aproveitado", r.hlAproveitado, 8);
eq("percentual de avaria", r.pctAvaria, 20);
eq("HL por hora", r.hlPorHora, 5);
eq("minutos por lote", r.minutosPorLote, 60);

console.log("\n== SESSAO VAZIA NAO INVENTA TAXA ==");
const vazia = resumirBatePalete(T("08:00"), T("10:00"), []);
eq("sem lote nao ha HL/h", vazia.hlPorHora, null);
eq("sem lote nao ha min/lote", vazia.minutosPorLote, null);
eq("sem lote nao ha % de avaria", vazia.pctAvaria, null);

console.log("\n== AVARIA POR PRODUTO: soma antes de dividir ==");
// Media de porcentagens daria (50 + 1) / 2 = 25,5% -- e trataria um lote
// de 2 HL igual a um de 100. Somando primeiro, o numero e 2,96%.
const porProduto = avariaPorProduto([
  { produtoId: "a", hlBatido: 2, hlAvariado: 1 },
  { produtoId: "a", hlBatido: 100, hlAvariado: 2 },
  { produtoId: "b", hlBatido: 50, hlAvariado: 20 },
]);
const a = porProduto.find((x) => x.produtoId === "a");
eq("percentual do produto soma antes de dividir", a.pctAvaria, 2.9);
eq("lotes do produto", a.lotes, 2);
// Ordenado pelo VOLUME de avaria: um lote unico com 100% lideraria para
// sempre se a ordem fosse por percentual.
eq("ordem e pelo HL avariado", porProduto.map((x) => x.produtoId), ["b", "a"]);
eq("sem item nenhum", avariaPorProduto([]), []);

console.log("\n== MEDIA POR DIA: domingo parado nao entra ==");
eq("3 dias com movimento, 30 HL",
  mediaHlPorDia([
    { dia: "2026-09-01", hl: 10 },
    { dia: "2026-09-01", hl: 5 },
    { dia: "2026-09-02", hl: 10 },
    { dia: "2026-09-03", hl: 5 },
  ]),
  10);
eq("sem sessao nenhuma", mediaHlPorDia([]), null);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
