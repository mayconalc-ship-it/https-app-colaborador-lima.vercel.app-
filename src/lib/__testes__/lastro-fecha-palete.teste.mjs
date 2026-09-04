// O lastro fecha o palete? Confere a regra contra os produtos REAIS que a
// conferencia de 04/09/2026 achou no cadastro de Sao Felix.
// Rode: npx tsx src/lib/__testes__/lastro-fecha-palete.teste.mjs
//
// Este erro nao da erro: o HL passa por caixas, entao lastro errado
// produz HL errado com cara de certo. O teste existe porque a unica
// forma de pegar a regra quebrada e aqui -- na tela ela some no meio de
// 565 produtos.
import { lastroFechaOPalete, camadasDoPalete } from "../produtividade-armazem.ts";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

const produto = (caixasPallet, caixasPorLastro) => ({
  id: "x",
  codigo: "x",
  descricao: "x",
  clusterProduto: null,
  unidadesPorCaixa: null,
  caixasPallet,
  caixasPorLastro,
  fatorHecto: 0.06,
  tipo: null,
  embalagemId: "e",
  metaReepackHora: null,
  metaDespejoHora: null,
});

console.log("== FECHA: o palete cabe num numero inteiro de camadas ==");
// 7 lastros de 20 fazem o palete de 140 -- o caso normal do patio.
conferir("140 cx/pallet, 20 cx/lastro (7 camadas)", lastroFechaOPalete(produto(140, 20)), true);
conferir("1650 cx/pallet, 150 cx/lastro (11 camadas)", lastroFechaOPalete(produto(1650, 150)), true);
conferir("um lastro = o palete inteiro", lastroFechaOPalete(produto(60, 60)), true);

console.log("\n== NAO FECHA: os casos reais do cadastro ==");
// HALLS EXTRA FORTE 22007 e HALLS MORANGO 27179.
conferir("1650 / 14 = 117,86 camadas", lastroFechaOPalete(produto(1650, 14)), false);
// HALLS MENTA 22005 -- lastro maior que meio palete.
conferir("1650 / 1000 = 1,65 camadas", lastroFechaOPalete(produto(1650, 1000)), false);
// GATORADE MELANCIA-MORANGO 23731.
conferir("294 / 40 = 7,35 camadas", lastroFechaOPalete(produto(294, 40)), false);
// BUDWEISER SLEEK MULTIPACK 37450.
conferir("66 / 28 = 2,36 camadas", lastroFechaOPalete(produto(66, 28)), false);

console.log("\n== CADASTRO INCOMPLETO NAO E INCOERENCIA ==");
// Nulo e "nao sei", e a tela ja trata isso em outro lugar: a unidade
// simplesmente nao e oferecida. Marcar de vermelho os 106 produtos sem
// lastro afogaria os 10 que estao de fato errados.
conferir("sem lastro cadastrado", lastroFechaOPalete(produto(140, null)), null);
conferir("sem caixas por pallet", lastroFechaOPalete(produto(null, 20)), null);
conferir("nenhum dos dois", lastroFechaOPalete(produto(null, null)), null);
// SKOL ZERO 36024, que tem lastro e nao tem palete.
conferir("36024: lastro 12, sem cx/pallet", lastroFechaOPalete(produto(null, 12)), null);

console.log("\n== O NUMERO DE CAMADAS, PARA A TELA MOSTRAR A CONTA ==");
// A tela diz "1650 / 14 = 117,86 camadas" porque isso sozinho revela
// qual dos dois numeros esta errado. "Lastro inconsistente" mandaria a
// pessoa refazer a divisao na mao.
conferir("1650 / 14", camadasDoPalete(produto(1650, 14)), 117.86);
conferir("294 / 40", camadasDoPalete(produto(294, 40)), 7.35);
conferir("140 / 20 (inteiro)", camadasDoPalete(produto(140, 20)), 7);
conferir("sem lastro nao tem camada", camadasDoPalete(produto(140, null)), null);

console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} CASO(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
