// O catalogo das fontes de dados. O que se guarda aqui e a promessa de
// que a tela de Fontes descreve a REALIDADE -- se ela apontar para uma
// tabela que nao existe ou uma tela que sumiu, ela vira mentira
// organizada, que e pior que a bagunca de antes.
//   npx tsx src/lib/__testes__/fontes-de-dados.teste.mjs
import {
  FONTES, ROTULO_TIPO, fonteDe, linkDeCanalValido, COMO_COLAR, tipoDoLink,
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
// Os canais do rodape (link fixo) nao tem tela de modulo: apontam para a
// inicial, que e onde o rodape aparece.
ok(
  "toda fonte aponta para a tela do modulo",
  FONTES.every((f) => (f.estatica ? f.telaDoModulo === "/" : f.telaDoModulo.startsWith("/admin/"))),
);
ok("toda fonte diz de qual modulo herda a permissao", FONTES.every((f) => !!f.modulo));
ok("todo tipo tem rotulo", FONTES.every((f) => !!ROTULO_TIPO[f.tipo]));

// TODA fonte guarda link desde 08/09/2026: as duas por upload (Produtos e
// Desafio) sairam do catalogo. Sem tabela, a tela tentaria gravar num
// lugar que nao existe -- e uma gaveta que nao aponta nem atualiza so
// ensina que algumas gavetas nao fazem nada.
console.log("\n== TODA FONTE TEM LINK E TABELA ==");
ok("toda fonte aponta a tabela", FONTES.every((f) => !!f.tabela));
eq("quantas fontes", FONTES.length, 7);

// Toda fonte diz o que colar, e o que ela diz bate com o que ela le.
ok("toda fonte diz o que colar", FONTES.every((f) => !!COMO_COLAR[f.colar]));
ok("fonte de pasta pede pasta", FONTES.filter((f) => f.tipo === "pasta-drive" && f.chave !== "clientes").every((f) => f.colar === "pasta"));
eq("RV pede o arquivo", fonteDe("rv").colar, "arquivo");
eq("canais pedem o site", fonteDe("canais").colar, "site");

eq("link de pasta", tipoDoLink("https://drive.google.com/drive/folders/1Mqr0T3iRQOAH-Mk_rVaBD94ojOhWJCnx"), "pasta");
eq("link de pasta com conta", tipoDoLink("https://drive.google.com/drive/u/0/folders/1Mqr0T3iRQOAH"), "pasta");
eq("link de arquivo", tipoDoLink("https://drive.google.com/file/d/1abcDEF/view?usp=sharing"), "arquivo");
eq("link de planilha", tipoDoLink("https://docs.google.com/spreadsheets/d/1QURLwttbRXpBAYX/edit#gid=0"), "arquivo");
eq("csv publicado", tipoDoLink("https://docs.google.com/spreadsheets/d/e/2PACX/pub?output=csv"), "arquivo");
eq("formulario", tipoDoLink("https://forms.office.com/r/MGf5xTSDzr"), "site");
eq("texto solto", tipoDoLink("pasta do rating"), "outro");
ok("canais do rodape e link fixo", fonteDe("canais")?.estatica === true && fonteDe("canais")?.tipo === "link-canal");

// O link do canal vira href no botao da ouvidoria, que todo mundo ve.
eq("aceita https", linkDeCanalValido("https://forms.office.com/r/MGf5xTSDzr"), "https://forms.office.com/r/MGf5xTSDzr");
eq("aceita com espaco em volta", linkDeCanalValido("  https://ouvidoria-limalogistica.lovable.app/ "), "https://ouvidoria-limalogistica.lovable.app/");
eq("recusa javascript:", linkDeCanalValido("javascript:alert(1)"), null);
eq("recusa texto solto", linkDeCanalValido("ouvidoria barreiras"), null);
eq("recusa sem dominio", linkDeCanalValido("https://localhost"), null);
eq("recusa vazio", linkDeCanalValido(""), null);
ok("nenhuma e por envio de arquivo", FONTES.every((f) => f.tipo !== "upload"));
// A acao que libera cada fonte tem que EXISTIR no modulo dela -- "criar"
// no RV nunca apareceria para ninguem (ver 08/09/2026).
ok(
  "acaoParaEditar so aceita criar ou editar",
  FONTES.every((f) => !f.acaoParaEditar || ["criar", "editar"].includes(f.acaoParaEditar)),
);
// Opcao de import sem nome nao chega ao servidor: o campo vai no FormData
// por ele.
ok(
  "toda opcao de import tem nome e rotulo",
  FONTES.every((f) => (f.opcoes ?? []).every((o) => !!o.nome && !!o.rotulo)),
);

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
