// Quem pode entrar na conferencia SEM data de validade.
//   npx tsx src/lib/__testes__/produto-sem-validade.teste.mjs
//
// A regra erra para os dois lados, e os dois custam:
//   - larga demais: item que vence entra sem data, e sem data nao existe
//     alerta de validade minima -- o produto perto de vencer passa sem
//     ninguem ver.
//   - apertada demais: o conferente inventa uma data para o destilado, e
//     data inventada vira alerta de vencimento para produto que nao vence.
import { produtoSemValidade, CLUSTER_SEM_VALIDADE } from "../carretas.ts";

let falhas = 0;
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}

console.log("== O CLUSTER DO CADASTRO ==");
// E o valor que a planilha traz hoje, nos HALLS e nos destilados.
ok("MKT PLACE, como esta no cadastro", produtoSemValidade("MKT PLACE"));
ok("a constante bate com o cadastro", produtoSemValidade(CLUSTER_SEM_VALIDADE));

console.log("\n== NAO DEPENDE DE COMO FOI DIGITADO ==");
// Uma comparacao literal quebraria no dia em que alguem digitasse
// diferente na planilha -- e quebraria para o lado ERRADO: voltaria a
// exigir a data de quem nao tem.
ok("minuscula", produtoSemValidade("mkt place"));
ok("misturado", produtoSemValidade("Mkt Place"));
ok("com espaco sobrando", produtoSemValidade("  MKT   PLACE  "));
ok("sem espaco", produtoSemValidade("MKTPLACE"));
ok("com traco", produtoSemValidade("MKT-PLACE"));
ok("com underscore", produtoSemValidade("MKT_PLACE"));
ok("por extenso", produtoSemValidade("MARKETPLACE"));
ok("por extenso com espaco", produtoSemValidade("MARKET PLACE"));

console.log("\n== TODO O RESTO EXIGE DATA ==");
// Estes sao clusters reais do cadastro de Sao Felix.
ok("cerveja exige", !produtoSemValidade("001 - CERVEJA"));
ok("refrigerante exige", !produtoSemValidade("REFRIGERANTE"));
ok("nao invento parentesco por conter a palavra", !produtoSemValidade("MKT PLACE ALIMENTOS"));

console.log("\n== PRODUTO SEM CLUSTER EXIGE DATA ==");
// O cluster vazio e o caso do cadastro incompleto. Na duvida, EXIGE: o
// erro de exigir demais e visivel na hora (a pessoa reclama); o de
// exigir de menos so aparece quando um produto vence na prateleira.
ok("nulo exige", !produtoSemValidade(null));
ok("indefinido exige", !produtoSemValidade(undefined));
ok("string vazia exige", !produtoSemValidade(""));
ok("so espacos exige", !produtoSemValidade("   "));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
