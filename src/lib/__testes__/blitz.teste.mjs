// Quem cai na blitz, e o que sai para o transportador.
//   npx tsx src/lib/__testes__/blitz.teste.mjs
//
// Os dois erros custam caro e para lados diferentes: parar a carreta de
// quem nao merece queima a relacao com o transportador e faz o conferente
// tratar a blitz como burocracia; nao parar quem merece deixa a avaria
// virar rotina -- que e o problema que a blitz existe para atacar.
import {
  indicePorDimensao,
  indices,
  indicesDaChegada,
  decidirBlitz,
  chaveDaDimensao,
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

const entrega = (placa, motorista, transp, pct) => ({
  placaCarreta: placa,
  motorista,
  transportadoraNome: transp,
  pctAvaria: pct,
});

// Numeros na escala dos reais de Sao Felix (a media da EXPRESSO estava em
// 26,7% em 05/09/2026).
const historico = [
  // A carreta velha da frota boa: a EXPRESSO vai bem, a PCN-0509 nao.
  entrega("PCN-0509", "JAYLSON", "EXPRESSO", 28),
  entrega("PCN-0509", "MARCOS", "EXPRESSO", 34),
  entrega("PCN-0509", "JAYLSON", "EXPRESSO", 30),
  entrega("ABC-1D23", "MARCOS", "EXPRESSO", 1),
  entrega("ABC-1D23", "MARCOS", "EXPRESSO", 2),
  entrega("ABC-1D23", "MARCOS", "EXPRESSO", 0),
  entrega("ABC-1D23", "MARCOS", "EXPRESSO", 1),
  entrega("ABC-1D23", "MARCOS", "EXPRESSO", 2),
  // Um caso isolado ruim, sem historico.
  entrega("NOV-0A00", "PEDRO", "NOVA", 90),
];

console.log("== O INDICE E DE CADA DIMENSAO ==");
const porCarreta = indicePorDimensao(historico, "carreta");
eq("tres carretas", porCarreta.length, 3);
eq("pior primeiro", porCarreta[0].nome, "NOV-0A00");
const pcn = porCarreta.find((i) => i.nome === "PCN-0509");
eq("media da PCN-0509", pcn.media, 30.67);
eq("cargas contadas", pcn.cargas, 3);

const tres = indices(historico);
const expresso = tres.transportadora.find((i) => i.nome === "EXPRESSO");
// 8 cargas: (28+34+30+1+2+0+1+2)/8 = 12,25.
eq("a EXPRESSO como FROTA fica em 12,25%", expresso.media, 12.25);

console.log("\n== A CARRETA RUIM NAO SE ESCONDE NA FROTA BOA ==");
// E o ponto do dono: a avaria nasce na asa delta e na grade DAQUELA placa.
// Com limite de 20%, a frota inteira passaria -- a placa, nao.
ok("cenario: a frota esta DENTRO do limite de 20", expresso.media <= 20);
const daPcn = indicesDaChegada(historico, {
  placaCarreta: "pcn 0509",
  motorista: "Jaylson",
  transportadoraNome: "Expresso",
});
const paraPcn = decidirBlitz(daPcn, 20);
ok("cai mesmo assim", paraPcn.cai);
eq("e quem estourou foi a carreta", paraPcn.dimensao, "carreta");
eq("com o nome da placa", paraPcn.nome, "PCN-0509");
eq("a media congelada e a da placa", paraPcn.media, 30.67);
ok("o motivo tem os dois numeros", paraPcn.motivo.includes("30.67%") && paraPcn.motivo.includes("20%"));
eq("e as tres avaliadas vao junto", paraPcn.avaliadas.length, 3);

console.log("\n== A PLACA BOA COM MOTORISTA RUIM ==");
// Mesma carreta, conducao diferente: JAYLSON so roda na placa ruim, entao
// o indice dele acompanha. Aqui a placa esta limpa e o motorista nao.
const conducao = [
  entrega("BOA-1111", "CARLOS", "BERSEBA", 30),
  entrega("BOA-2222", "CARLOS", "BERSEBA", 35),
  entrega("BOA-3333", "CARLOS", "BERSEBA", 40),
  entrega("BOA-1111", "ANA", "BERSEBA", 1),
  entrega("BOA-2222", "ANA", "BERSEBA", 0),
  entrega("BOA-3333", "ANA", "BERSEBA", 1),
];
const daPlacaBoa = indicesDaChegada(conducao, {
  placaCarreta: "BOA-1111",
  motorista: "CARLOS",
  transportadoraNome: "BERSEBA",
});
ok("cenario: a placa sozinha esta dentro do limite", daPlacaBoa.carreta.media <= 20);
const porConducao = decidirBlitz(daPlacaBoa, 20);
ok("cai", porConducao.cai);
eq("e o alvo e o motorista", porConducao.dimensao, "motorista");
eq("nomeado", porConducao.nome, "CARLOS");

console.log("\n== SEM HISTORICO, NAO PARA A CARRETA ==");
// Uma carga com 90% nao condena ninguem -- pode ter sido a carga daquele
// dia. Parar por um caso queima a relacao a toa.
const daNova = indicesDaChegada(historico, {
  placaCarreta: "NOV-0A00",
  motorista: "PEDRO",
  transportadoraNome: "NOVA",
});
eq(`1 carga e menos que ${MINIMO_DE_CARRETAS}`, daNova.carreta.confiavel, false);
const semBase = decidirBlitz(daNova, 5);
ok("nao cai", !semBase.cai);
ok("e diz por que", semBase.motivo.includes("Sem base"));

console.log("\n== DENTRO DO LIMITE, NAO CAI ==");
const daBoa = indicesDaChegada(historico, {
  placaCarreta: "ABC-1D23",
  motorista: "MARCOS",
  transportadoraNome: "EXPRESSO",
});
ok("nao cai", !decidirBlitz(daBoa, 20).cai);
// Empate NAO para a carreta: o limite e o ultimo valor ainda aceitavel,
// mesma regra das metas e do gatilho de anomalia.
const noOlho = { ...daBoa.carreta, media: 20 };
ok("empate no limite nao cai", !decidirBlitz({ carreta: noOlho }, 20).cai);

console.log("\n== SEM LIMITE CONFIGURADO, A BLITZ NAO ADIVINHA ==");
const semRegua = decidirBlitz(daPcn, null);
ok("nao cai", !semRegua.cai);
ok("explica que falta a regua", semRegua.motivo.includes("limite"));

console.log("\n== CHEGADA DESCONHECIDA ==");
ok("nao cai", !decidirBlitz({}, 5).cai);
ok("nao cai com placa nova", !decidirBlitz(indicesDaChegada(historico, { placaCarreta: "ZZZ-9999" }), 5).cai);

console.log("\n== A PLACA E A MESMA, ESCRITA DE TRES JEITOS ==");
// Sem normalizar, a mesma carreta viraria tres carretas de uma carga cada,
// nenhuma chegaria ao minimo, e a blitz nunca dispararia -- sem erro nenhum
// aparecer.
eq("hifen, espaco e minuscula dao a mesma chave", chaveDaDimensao("pcn-0509"), "PCN0509");
eq("e sem separador nenhum, tambem", chaveDaDimensao("PCN 0509"), "PCN0509");
eq("acento no motorista nao separa", chaveDaDimensao("JOÃO"), "JOAO");
const misturado = indicePorDimensao(
  [entrega("pcn-0509", "a", "x", 30), entrega("PCN 0509", "a", "x", 30), entrega("PCN0509", "a", "x", 30)],
  "carreta",
);
eq("uma carreta, tres cargas", misturado.length, 1);
eq("e o minimo foi atingido", misturado[0].confiavel, true);

console.log("\n== SEM IDENTIFICACAO, NAO ENTRA NO INDICE ==");
// Somar tudo num balde "(sem placa)" inventaria um indice que nao e de
// ninguem -- e pararia a proxima carreta sem placa por causa dele.
eq("carreta sem placa fica de fora", indicePorDimensao([entrega(null, "a", "x", 90)], "carreta").length, 0);

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
  dimensao: "carreta",
  nomeDoIndice: "PCN-0509",
  mediaAvaria: 30.67,
  limite: 5,
  respostas: [
    { pergunta: "Grades laterais completas e travadas?", resposta: "nok", observacao: "Grade do meio faltando no lado direito.", fotoUrl: "https://exemplo/foto1.webp" },
    { pergunta: "Assoalho sem tabua solta?", resposta: "ok" },
    { pergunta: "Motorista com EPI?", resposta: "na" },
    { pergunta: "Lacre inteiro e igual ao da nota?", resposta: "nok", fotoUrl: "https://exemplo/foto2.webp" },
  ],
};
const texto = textoDaOcorrencia(dados);
ok("comeca pelo transportador", texto.startsWith("Prezados, EXPRESSO DO OCIDENTE,"));
ok("traz a placa da carreta", texto.includes("PCN-0509"));
ok("traz o motorista", texto.includes("JAYLSON CHAVES"));
ok("traz a DT", texto.includes("742881"));
ok("data em pt-BR", texto.includes("04/09/2026"));
ok("diz POR QUE foi inspecionada", texto.includes("30.67%") && texto.includes("5%"));
// Dizer O QUE estourou: a acao do transportador e outra se o problema esta
// numa placa especifica e nao na frota.
ok("aponta a carreta, e nao a frota", texto.includes("com carreta PCN-0509 está em"));
ok("conta as duas nao conformidades", texto.includes("IDENTIFICADAS (2)"));
ok("leva a observacao", texto.includes("Grade do meio faltando"));
ok("leva os dois links de foto", texto.includes("foto1.webp") && texto.includes("foto2.webp"));
// So o NOK entra: mandar "assoalho: ok" para o transportador dilui o que
// importa, e um e-mail com dezesseis linhas de "ok" nao e cobranca.
ok("NAO leva os itens ok", !texto.includes("Assoalho sem tabua"));
ok("NAO leva os N/A", !texto.includes("Motorista com EPI"));
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
