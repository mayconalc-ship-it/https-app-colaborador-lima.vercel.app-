// Nome de pessoa na lista de quem curtiu. O cadastro vem em CAIXA ALTA e
// completo; a lista precisa do jeito que se fala.
//   npx tsx src/lib/__testes__/nomes.teste.mjs
import { nomeCurto, resumirNomes } from "../nomes.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("== NOMES REAIS DO CADASTRO ==");
eq("quatro partes", nomeCurto("MAYCON ANTONIO ALCANFOR ALVES"), "Maycon Alves");
eq("com particula", nomeCurto("JORGE LUIS DE ALMEIDA MATOS"), "Jorge Matos");
eq("com 'DOS'", nomeCurto("DENES DOS SANTOS LOPES"), "Denes Lopes");
eq("com 'DA'", nomeCurto("BRUNA DARCIA PEREIRA DA SILVA"), "Bruna Silva");
eq("nome composto", nomeCurto("ALLANA BEATRIZ DOS ANJOS TEIXEIRA"), "Allana Teixeira");

console.log("\n== BORDAS DO CADASTRO ==");
eq("so um nome", nomeCurto("MADONNA"), "Madonna");
// Cadastro cortado no meio: "Maria da" pareceria erro de sistema, entao a
// particula no fim e ignorada e sobra o primeiro nome.
eq("termina em particula", nomeCurto("MARIA DA"), "Maria");
eq("espacos sobrando", nomeCurto("   JOSE   PEREIRA   "), "Jose Pereira");
eq("vazio", nomeCurto(""), "");
eq("nulo", nomeCurto(null), "");
eq("indefinido", nomeCurto(undefined), "");
// A particula do MEIO fica minuscula: "Maria da Silva", nao "Maria Da
// Silva" -- mas aqui ela nem aparece, porque so saem primeiro e ultimo.
eq("ja em caixa baixa", nomeCurto("jose de macedo souza"), "Jose Souza");
eq("acento sobrevive", nomeCurto("JOÃO AUGUSTO DE SOUZA CAMPOS"), "João Campos");

console.log("\n== RESUMO DA LISTA ==");
eq("um", resumirNomes(["Maycon Alves"]), "Maycon Alves");
eq("dois", resumirNomes(["Maycon Alves", "Jorge Matos"]), "Maycon Alves e Jorge Matos");
// Tres ja passa do limite: dois nomes e a contagem. Numa materia com 40
// curtidas a linha viraria um paragrafo.
eq("tres", resumirNomes(["A", "B", "C"]), "A, B e mais 1");
eq("muitos", resumirNomes(["A", "B", "C", "D", "E", "F", "G"]), "A, B e mais 5");
eq("nenhum", resumirNomes([]), "");
eq("limite configuravel", resumirNomes(["A", "B", "C", "D"], 3), "A, B, C e mais 1");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
