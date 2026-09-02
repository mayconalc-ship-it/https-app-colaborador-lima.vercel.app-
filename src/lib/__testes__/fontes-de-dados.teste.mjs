// O catalogo das fontes de dados. O que se guarda aqui e a promessa de
// que a tela de Fontes descreve a REALIDADE -- se ela apontar para uma
// tabela que nao existe ou uma tela que sumiu, ela vira mentira
// organizada, que e pior que a bagunca de antes.
//   npx tsx src/lib/__testes__/fontes-de-dados.teste.mjs
import {
  FONTES, ROTULO_TIPO, fontesComLink, fontesPorUpload, fonteDe,
  tempoDesde, estaVelha, DIAS_ATE_ENVELHECER,
} from "../fontes-de-dados.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
function ok(nome, cond, det = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${det ? ": " + det : ""}`);
}

console.log("== O CATALOGO DESCREVE A REALIDADE ==");
ok("nenhuma chave repetida", new Set(FONTES.map((f) => f.chave)).size === FONTES.length);
ok("toda fonte diz o que alimenta", FONTES.every((f) => f.alimenta.length > 20));
ok("toda fonte tem ajuda escrita", FONTES.every((f) => f.ajuda.length > 20));
ok("toda fonte aponta para a tela do modulo", FONTES.every((f) => f.telaDoModulo.startsWith("/admin/")));
ok("toda fonte diz de qual modulo herda a permissao", FONTES.every((f) => !!f.modulo));
ok("todo tipo tem rotulo", FONTES.every((f) => !!ROTULO_TIPO[f.tipo]));

// Quem guarda link PRECISA dizer em qual tabela; quem nao guarda nao pode
// dizer -- senao a tela tentaria gravar num lugar que nao existe.
console.log("\n== LINK E TABELA ANDAM JUNTOS ==");
ok("fonte com link aponta a tabela", fontesComLink().every((f) => !!f.tabela));
ok("fonte por upload NAO aponta tabela", fontesPorUpload().every((f) => !f.tabela));
eq("quantas guardam link", fontesComLink().length, 5);
eq("quantas sao por upload", fontesPorUpload().length, 2);
eq("as duas listas somam o catalogo", fontesComLink().length + fontesPorUpload().length, FONTES.length);

console.log("\n== BUSCA ==");
eq("acha pela chave", fonteDe("rating").rotulo, "Rating de Entrega");
eq("chave inexistente devolve indefinido", fonteDe("nao-existe"), undefined);

console.log("\n== HA QUANTO TEMPO ==");
const base = new Date("2026-09-02T12:00:00Z");
const atras = (min) => new Date(base.getTime() - min * 60000).toISOString();
eq("nunca sincronizada", tempoDesde(null, base), "nunca");
eq("agora mesmo", tempoDesde(atras(1), base), "agora");
eq("minutos", tempoDesde(atras(40), base), "há 40 min");
eq("horas", tempoDesde(atras(60 * 5), base), "há 5 h");
eq("um dia", tempoDesde(atras(60 * 30), base), "há 1 dia");
eq("varios dias", tempoDesde(atras(60 * 24 * 4), base), "há 4 dias");
// Relogio adiantado nao pode virar tempo negativo.
eq("futuro nao vira negativo", tempoDesde(new Date(base.getTime() + 60000).toISOString(), base), "agora");

console.log("\n== ESTA VELHA? ==");
ok("nunca importada conta como velha", estaVelha(null, base));
ok("importada hoje nao esta velha", !estaVelha(atras(60 * 2), base));
// Sexta para segunda da tres dias e e normal na operacao.
ok(`${DIAS_ATE_ENVELHECER} dias ainda nao e velha`, !estaVelha(atras(60 * 24 * DIAS_ATE_ENVELHECER), base));
ok("acima do corte e velha", estaVelha(atras(60 * 24 * (DIAS_ATE_ENVELHECER + 1)), base));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
