// Quem cai na blitz, e o que sai para o transportador.
//   npx tsx src/lib/__testes__/blitz.teste.mjs
//
// Os dois erros custam caro e para lados diferentes: parar a carreta de
// quem nao merece queima a relacao com o transportador e faz o conferente
// tratar a blitz como burocracia; nao parar quem merece deixa a avaria
// virar rotina -- que e o problema que a blitz existe para atacar.
import {
  indicePorTransportadora,
  decidirBlitz,
  textoDaOcorrencia,
  assuntoDaOcorrencia,
  MINIMO_DE_CARRETAS,
} from "../blitz.ts";

let falhas = 0;
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}
function eq(nome, obtido, esperado) {
  const igual = obtido === esperado;
  if (!igual) falhas++;
  console.log(`  ${igual ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

const entrega = (nome, pct) => ({ transportadoraId: nome, transportadoraNome: nome, pctAvaria: pct });

console.log("== O INDICE E POR TRANSPORTADORA ==");
// Numeros na escala dos reais de Sao Felix (a media da EXPRESSO estava
// em 26,7% em 05/09/2026).
const indices = indicePorTransportadora([
  entrega("EXPRESSO", 30), entrega("EXPRESSO", 20), entrega("EXPRESSO", 40),
  entrega("BERSEBA", 2), entrega("BERSEBA", 4), entrega("BERSEBA", 0),
  entrega("NOVA", 90),
]);
eq("tres transportadoras", indices.length, 3);
eq("ordenado pela pior primeiro", indices[0].nome, "NOVA");
const expresso = indices.find((i) => i.nome === "EXPRESSO");
eq("media da EXPRESSO", expresso.media, 30);
eq("carretas contadas", expresso.carretas, 3);

console.log("\n== SEM HISTORICO, NAO PARA A CARRETA ==");
// Uma carreta com 90% nao faz transportadora ruim -- pode ter sido a
// carga daquele dia. Parar por um caso queima a relacao a toa.
const nova = indices.find((i) => i.nome === "NOVA");
eq(`1 carreta e menos que ${MINIMO_DE_CARRETAS}`, nova.confiavel, false);
const semBase = decidirBlitz(nova, 5);
ok("nao cai na blitz", !semBase.cai);
ok("e diz por que", semBase.motivo.includes("menos que"));

console.log("\n== ACIMA DO LIMITE, CAI ==");
const caiu = decidirBlitz(expresso, 5);
ok("cai", caiu.cai);
eq("leva a media congelada", caiu.media, 30);
eq("e quantas carretas", caiu.carretas, 3);
ok("o motivo tem os dois numeros", caiu.motivo.includes("30%") && caiu.motivo.includes("5%"));

console.log("\n== DENTRO DO LIMITE, NAO CAI ==");
const berseba = indices.find((i) => i.nome === "BERSEBA");
ok("nao cai", !decidirBlitz(berseba, 5).cai);
// Empate NAO para a carreta: o limite e o ultimo valor ainda aceitavel,
// mesma regra das metas e do gatilho de anomalia.
ok("empate no limite nao cai", !decidirBlitz({ ...berseba, media: 5 }, 5).cai);

console.log("\n== SEM LIMITE CONFIGURADO, A BLITZ NAO ADIVINHA ==");
const semRegua = decidirBlitz(expresso, null);
ok("nao cai", !semRegua.cai);
ok("explica que falta a regua", semRegua.motivo.includes("limite"));

console.log("\n== TRANSPORTADORA DESCONHECIDA ==");
ok("nao cai", !decidirBlitz(undefined, 5).cai);

console.log("\n== O RELATO DE OCORRENCIA ==");
const dados = {
  transportadora: "EXPRESSO DO OCIDENTE",
  placaCarreta: "PCN-0509",
  placaCavalo: "SOI-1C16",
  motorista: "JAYLSON CHAVES",
  numeroDt: "742881",
  chegadaEm: "2026-09-04T20:13:00Z",
  conferente: "DIEGO SOUZA",
  revenda: "Revenda Lima Sao Felix",
  mediaAvaria: 30,
  limite: 5,
  respostas: [
    { pergunta: "Lona e amarracao em bom estado?", resposta: "nok", observacao: "Cinta rompida no lado direito.", fotoUrl: "https://exemplo/foto1.webp" },
    { pergunta: "Assoalho integro?", resposta: "ok" },
    { pergunta: "Temperatura adequada?", resposta: "na" },
    { pergunta: "Lacre integro?", resposta: "nok", fotoUrl: "https://exemplo/foto2.webp" },
  ],
};
const texto = textoDaOcorrencia(dados);
ok("comeca pelo transportador", texto.startsWith("Prezados, EXPRESSO DO OCIDENTE,"));
ok("traz a placa da carreta", texto.includes("PCN-0509"));
ok("traz o motorista", texto.includes("JAYLSON CHAVES"));
ok("traz a DT", texto.includes("742881"));
ok("data em pt-BR", texto.includes("04/09/2026"));
ok("diz POR QUE foi inspecionada", texto.includes("30%") && texto.includes("5%"));
ok("conta as duas nao conformidades", texto.includes("IDENTIFICADAS (2)"));
ok("leva a observacao", texto.includes("Cinta rompida"));
ok("leva os dois links de foto", texto.includes("foto1.webp") && texto.includes("foto2.webp"));
// So o NOK entra: mandar "assoalho: ok" para o transportador dilui o que
// importa, e um e-mail com dezesseis linhas de "ok" nao e cobranca.
ok("NAO leva os itens ok", !texto.includes("Assoalho integro"));
ok("NAO leva os N/A", !texto.includes("Temperatura adequada"));
ok("pede plano de acao", texto.includes("plano de ação"));

console.log("\n== O ASSUNTO IDENTIFICA A CARRETA ==");
const assunto = assuntoDaOcorrencia(dados);
ok("tem placa e DT", assunto.includes("PCN-0509") && assunto.includes("742881"));
ok("diz quantas nao conformidades", assunto.includes("2 não conformidade"));

console.log("\n== BLITZ SEM NOK NAO ACUSA NINGUEM ==");
const limpa = textoDaOcorrencia({ ...dados, respostas: [{ pergunta: "Lacre?", resposta: "ok" }] });
ok("diz que nao houve nao conformidade", limpa.includes("Nenhuma não conformidade"));
ok("nao pede plano de acao", !limpa.includes("plano de ação"));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
