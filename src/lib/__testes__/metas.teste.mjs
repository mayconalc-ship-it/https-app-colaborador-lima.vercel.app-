// A regua que pinta os cartoes. Errar o SENTIDO aqui inverte a cor de um
// indicador inteiro -- um TMA otimo apareceria em vermelho.
//   npx tsx src/lib/__testes__/metas.teste.mjs
import {
  avaliarMeta, media, lerValorDeMeta, metasDoGrupo, ehGrupoDeMetas,
  CATALOGO_DE_METAS, GRUPOS_DE_METAS, ROTULO_GRUPO,
} from "../metas.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

console.log("== MENOR E MELHOR (TMA, avaria) ==");
ok("abaixo do alvo bate", avaliarMeta(80, 90, "menor_melhor").batendo);
ok("acima do alvo NAO bate", !avaliarMeta(100, 90, "menor_melhor").batendo);
// "ate 2%" e batido com exatamente 2% -- empate como falha faria a meta
// ser um numero a mais.
ok("empate bate", avaliarMeta(90, 90, "menor_melhor").batendo);

console.log("\n== MAIOR E MELHOR (caixas/h) ==");
ok("acima do alvo bate", avaliarMeta(120, 100, "maior_melhor").batendo);
ok("abaixo do alvo NAO bate", !avaliarMeta(80, 100, "maior_melhor").batendo);
ok("empate bate", avaliarMeta(100, 100, "maior_melhor").batendo);

console.log("\n== TEXTO DISCRETO ==");
eq("acima, com sufixo", avaliarMeta(102, 90, "menor_melhor", { sufixo: "min" }).texto,
  "12 min acima da meta 90 min");
eq("abaixo, com sufixo", avaliarMeta(78, 90, "menor_melhor", { sufixo: "min" }).texto,
  "12 min abaixo da meta 90 min");
// No empate nao existe "0 acima".
eq("empate vira confirmacao seca", avaliarMeta(90, 90, "menor_melhor", { sufixo: "min" }).texto,
  "na meta 90 min");
eq("casas decimais", avaliarMeta(2.5, 2, "menor_melhor", { sufixo: "%", casas: 1 }).texto,
  "0,5 % acima da meta 2,0 %");
eq("sem sufixo nao deixa espaco solto", avaliarMeta(12, 10, "maior_melhor").texto,
  "2 acima da meta 10");

console.log("\n== LADO ==");
ok("102 vs 90 esta acima", avaliarMeta(102, 90, "menor_melhor").acima);
ok("78 vs 90 nao esta acima", !avaliarMeta(78, 90, "menor_melhor").acima);
// Bater a meta NAO quer dizer estar abaixo: em maior_melhor bate por cima.
ok("maior_melhor bate estando acima", avaliarMeta(120, 100, "maior_melhor").acima);

console.log("\n== MEDIA ==");
eq("media simples", media([10, 20, 30]), 20);
eq("ignora nulos", media([10, null, 30]), 20);
// Lista vazia nao pode virar zero: zero seria lido como "TMA zerado".
eq("lista vazia vira nulo", media([]), null);
eq("so nulos vira nulo", media([null, null]), null);
eq("ignora NaN", media([10, NaN, 30]), 20);

console.log("\n== CATALOGO ==");
ok("toda meta tem grupo conhecido", CATALOGO_DE_METAS.every((m) => GRUPOS_DE_METAS.includes(m.grupo)));
ok("todo grupo tem rotulo", GRUPOS_DE_METAS.every((g) => !!ROTULO_GRUPO[g]?.titulo));
ok("toda meta tem ajuda escrita", CATALOGO_DE_METAS.every((m) => m.ajuda.length > 20));
// Chave repetida gravaria duas metas no mesmo lugar em silencio.
eq("nenhuma chave repetida por fonte",
  new Set(CATALOGO_DE_METAS.map((m) => `${m.fonte}:${m.chave}`)).size, CATALOGO_DE_METAS.length);
// Meta que mora numa config existente PRECISA dizer em qual coluna.
ok("meta de config aponta a coluna",
  CATALOGO_DE_METAS.filter((m) => m.fonte !== "pa_metas").every((m) => !!m.coluna));
ok("meta de pa_metas nao tem coluna",
  CATALOGO_DE_METAS.filter((m) => m.fonte === "pa_metas").every((m) => !m.coluna));
ok("grupo com metas devolve elas", metasDoGrupo("recebimento").length === 2);
ok("grupo inexistente devolve vazio", metasDoGrupo("nao-existe").length === 0);
ok("todo grupo do catalogo tem ao menos uma meta",
  GRUPOS_DE_METAS.every((g) => metasDoGrupo(g).length > 0 || g === "bancada" || g === "despejo"));

// A capacidade da bombona NAO e meta: encher nao e bom nem ruim, e um
// fato do equipamento. Se virar meta, o cartao passa a pintar de verde
// ou vermelho um numero que nao tem lado certo.
const bombona = CATALOGO_DE_METAS.find((m) => m.chave === "despejo_capacidade_bombona");
ok("capacidade da bombona existe", !!bombona);
eq("capacidade e referencia, nao meta", bombona.tipo, "referencia");
ok("as demais nao sao referencia",
  CATALOGO_DE_METAS.filter((m) => m.chave !== "despejo_capacidade_bombona")
    .every((m) => m.tipo !== "referencia"));
// Duracao por caixa em MINUTOS: em horas o valor fica em "0,04h", que
// nao se le nem se cadastra.
eq("duracao por caixa e em minutos",
  CATALOGO_DE_METAS.find((m) => m.chave === "reepack_minutos_caixa").sufixo, "min");
eq("duracao por caixa e menor_melhor",
  CATALOGO_DE_METAS.find((m) => m.chave === "reepack_minutos_caixa").sentido, "menor_melhor");
ok("rating e maior_melhor", CATALOGO_DE_METAS.find((m) => m.chave === "rating_nota_media").sentido === "maior_melhor");
ok("TMA e menor_melhor", CATALOGO_DE_METAS.find((m) => m.chave === "tma_alvo_minutos").sentido === "menor_melhor");
// h/P20 e a pegadinha do sentido: botijao que dura MAIS e melhor.
ok("horas por P20 e maior_melhor",
  CATALOGO_DE_METAS.find((m) => m.chave === "empilhadeira_horas_p20").sentido === "maior_melhor");
ok("grupo valido passa", ehGrupoDeMetas("entrega"));
ok("grupo inventado nao passa", !ehGrupoDeMetas("qualquer"));

console.log("\n== LER O QUE FOI DIGITADO ==");
eq("numero simples", lerValorDeMeta("90"), 90);
eq("virgula decimal", lerValorDeMeta("1,6"), 1.6);
eq("ponto decimal", lerValorDeMeta("1.6"), 1.6);
eq("espacos sobrando", lerValorDeMeta("  90  "), 90);
// Vazio LIMPA a meta -- e diferente de zero: sem meta o cartao fica
// neutro, com meta zero ele passa a cobrar zero.
eq("vazio limpa a meta", lerValorDeMeta(""), null);
eq("nulo limpa a meta", lerValorDeMeta(null), null);
eq("zero e um valor, nao um vazio", lerValorDeMeta("0"), 0);
eq("negativo e invalido", lerValorDeMeta("-5"), "invalido");
eq("texto e invalido", lerValorDeMeta("abc"), "invalido");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
