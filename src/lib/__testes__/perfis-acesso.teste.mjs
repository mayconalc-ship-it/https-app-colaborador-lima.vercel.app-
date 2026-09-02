// Perfis de acesso. Isto decide QUEM VE O QUE -- um erro aqui nao da
// mensagem de erro, so entrega ou tira acesso em silencio. Por isso o
// teste guarda, acima de tudo, que aplicar um perfil nunca REMOVE nada.
//   npx tsx src/lib/__testes__/perfis-acesso.teste.mjs
import {
  simularAplicacao, temOPerfil, agruparPorModulo,
  lerConcessoesDoFormulario, chaveDaConcessao,
} from "../perfis-acesso.ts";

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

const c = (m, a) => ({ modulo: m, acao: a });

console.log("== APLICAR NUNCA REMOVE ==");
const perfil = [c("rating", "ver"), c("rating", "criar")];
const pessoa = [c("comunicados", "ver"), c("rating", "ver")];
const r = simularAplicacao(perfil, pessoa);
eq("entra so o que falta", r.entram, [c("rating", "criar")]);
eq("o que ja tinha do perfil e listado a parte", r.jaTinha, [c("rating", "ver")]);
// O que a pessoa tem ALEM do perfil aparece, mas nao e tocado: aplicar um
// perfil a quem administra outra coisa nao pode tirar o que ela tinha.
eq("o que ela tem fora do perfil e preservado", r.foraDoPerfil, [c("comunicados", "ver")]);

console.log("\n== CASOS DE BORDA ==");
eq("perfil vazio nao entrega nada", simularAplicacao([], pessoa).entram, []);
eq("pessoa sem nada recebe o perfil inteiro", simularAplicacao(perfil, []).entram, perfil);
eq("pessoa sem nada nao tem sobras", simularAplicacao(perfil, []).foraDoPerfil, []);
eq("aplicar duas vezes nao entrega nada na segunda",
  simularAplicacao(perfil, perfil).entram, []);

console.log("\n== QUEM 'E' O PERFIL ==");
ok("tem tudo do perfil", temOPerfil(perfil, [...perfil, c("quiz", "ver")]));
ok("falta uma concessao -> nao e", !temOPerfil(perfil, [c("rating", "ver")]));
// Ter MAIS nao desqualifica: um supervisor que tambem publica o jornal
// continua sendo supervisor. Exigir igualdade exata zeraria a contagem no
// primeiro ajuste fino.
ok("ter a mais continua sendo o perfil", temOPerfil(perfil, [...perfil, c("padroes", "editar")]));
ok("perfil vazio nao vale para ninguem", !temOPerfil([], pessoa));

console.log("\n== LER O FORMULARIO ==");
// O modulo tem traco no id. Cortar pelo PRIMEIRO traco transformaria
// "pa-reepack:ver" em "pa" + "reepack-ver" -- e a concessao gravada seria
// de um modulo que nao existe.
eq("modulo com traco e lido inteiro",
  lerConcessoesDoFormulario([["perm-pa-reepack-ver", "on"]]),
  [c("pa-reepack", "ver")]);
eq("modulo com dois tracos",
  lerConcessoesDoFormulario([["perm-meus-indicadores-ver", "on"]]),
  [c("meus-indicadores", "ver")]);
eq("modulo simples", lerConcessoesDoFormulario([["perm-rating-criar", "on"]]), [c("rating", "criar")]);
eq("campo que nao e permissao e ignorado",
  lerConcessoesDoFormulario([["nome", "x"], ["perm-rating-ver", "on"]]), [c("rating", "ver")]);
// Acao inventada nao pode virar linha no banco: a coluna tem check.
eq("acao invalida e descartada", lerConcessoesDoFormulario([["perm-rating-inventada", "on"]]), []);
eq("campo malformado nao quebra", lerConcessoesDoFormulario([["perm-", "on"], ["perm-x", "on"]]), []);

console.log("\n== AGRUPAR PARA A TELA ==");
eq("junta acoes do mesmo modulo",
  [...agruparPorModulo([c("rating", "ver"), c("rating", "criar"), c("quiz", "ver")])],
  [["rating", ["ver", "criar"]], ["quiz", ["ver"]]]);
eq("nao duplica acao repetida",
  [...agruparPorModulo([c("rating", "ver"), c("rating", "ver")])], [["rating", ["ver"]]]);

eq("chave", chaveDaConcessao("rating", "ver"), "rating:ver");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
