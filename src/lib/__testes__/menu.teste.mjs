// O agrupamento da tela inicial. Um item que some da home e um modulo que
// a pessoa nao acha -- por isso o teste guarda, acima de tudo, a garantia
// de que NADA se perde no caminho.
//   npx tsx src/lib/__testes__/menu.teste.mjs
import { agruparItens, BLOCOS_DO_MENU, DESTAQUES_DO_MENU, MENU_PADRAO } from "../menu.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
function ok(nome, cond, det = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${det ? ": " + det : ""}`);
}

const visiveis = MENU_PADRAO.filter((i) => i.visivel);

console.log("== NADA SE PERDE ==");
const blocos = agruparItens(visiveis);
const distribuidos = blocos.flatMap((b) => b.itens.map((i) => i.chave));
eq("todo item visivel aparece em algum bloco", distribuidos.length, visiveis.length);
ok("nenhum item duplicado", new Set(distribuidos).size === distribuidos.length);
const perdidos = visiveis.filter((i) => !distribuidos.includes(i.chave)).map((i) => i.chave);
ok("nenhuma chave sumiu", perdidos.length === 0, perdidos.join(", "));

console.log("\n== ITEM SEM BLOCO NAO DESAPARECE ==");
// O banco pode criar uma chave que ninguem mapeou. Ela tem que aparecer.
const comIntruso = agruparItens([...visiveis, { chave: "modulo-novo-do-banco" }]);
const todas = comIntruso.flatMap((b) => b.itens.map((i) => i.chave));
ok("chave desconhecida entra no primeiro bloco", todas.includes("modulo-novo-do-banco"));
eq("e vai para 'Minha rotina'",
  comIntruso.find((b) => b.itens.some((i) => i.chave === "modulo-novo-do-banco")).id, "rotina");

console.log("\n== BLOCO VAZIO NAO APARECE ==");
// Quem so tem acesso ao Desafio nao ve quatro titulos com um cartao.
const soQuiz = agruparItens(visiveis.filter((i) => i.chave === "quiz"));
eq("um item, um bloco", soQuiz.length, 1);
eq("e o bloco certo", soQuiz[0].id, "engajamento");
eq("lista vazia nao gera bloco", agruparItens([]).length, 0);

console.log("\n== ORDEM ==");
// A ordem do banco manda DENTRO do bloco -- o Admin reordena por la.
const rotina = blocos.find((b) => b.id === "rotina");
// O destaque sobe para o topo; o RESTO mantem a ordem do banco.
eq("o destaque vem primeiro no bloco", rotina.itens[0].chave, "rv");
const semDestaque = rotina.itens.filter((i) => !DESTAQUES_DO_MENU.has(i.chave)).map((i) => i.chave);
const ordemNoBanco = visiveis
  .filter((i) => semDestaque.includes(i.chave))
  .map((i) => i.chave);
eq("o resto segue a ordem do banco", semDestaque, ordemNoBanco);
eq("operacao tambem comeca pelo destaque",
  blocos.find((b) => b.id === "operacao").itens[0].chave, "produtividade-armazem");
// Um cartao de linha inteira no MEIO da grade deixa buraco ao lado do
// vizinho de cima. No topo, ele vira cabecalho do bloco.
ok("nenhum destaque fora da primeira posicao",
  blocos.every((b) => b.itens.every((i, n) => !DESTAQUES_DO_MENU.has(i.chave) || n === 0)));
eq("blocos saem na ordem declarada",
  blocos.map((b) => b.id),
  BLOCOS_DO_MENU.map((b) => b.id).filter((id) => blocos.some((b) => b.id === id)));

console.log("\n== DESTAQUES ==");
ok("RV e destaque", DESTAQUES_DO_MENU.has("rv"));
ok("Produtividade do Armazem e destaque", DESTAQUES_DO_MENU.has("produtividade-armazem"));
ok("os destaques existem no menu", [...DESTAQUES_DO_MENU].every((c) => MENU_PADRAO.some((i) => i.chave === c)));
// Destaque demais deixa de ser destaque.
ok("no maximo 2 destaques", DESTAQUES_DO_MENU.size <= 2, String(DESTAQUES_DO_MENU.size));

console.log("\n== CHAVES DOS BLOCOS SAO REAIS ==");
const doMenu = new Set(MENU_PADRAO.map((i) => i.chave));
for (const b of BLOCOS_DO_MENU) {
  const inexistentes = b.chaves.filter((c) => !doMenu.has(c));
  ok(`bloco "${b.titulo}" so cita chaves que existem`, inexistentes.length === 0, inexistentes.join(", "));
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
