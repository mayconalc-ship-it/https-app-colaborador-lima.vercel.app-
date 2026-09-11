// Confere a agregacao dos Indicadores do Refugo.
//   npx tsx src/lib/__testes__/refugo-indicadores.teste.mjs
import {
  agruparAfericoes, evolucaoDoRefugo, granularidadeDoPeriodo, incidenciaPorPlaca,
  rotuloDoPeriodo, segundaDaSemana, SEM_INFORMACAO,
} from "../refugo-indicadores.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado || (typeof obtido === "number" && typeof esperado === "number" && Math.abs(obtido - esperado) < 0.005);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

const af = (o) => ({
  data: "2026-08-10", mapa: "1", placa: "AAA1A11", veiculo: "0046", tipoSorteio: "Alto Indice Refugo",
  pctIncidenciaVeiculo: 5, motoristaNome: "JOSE", conferenteNome: "LUCAS MORAES PEREIRA",
  itemCodigo: "A", itemDescricao: "GFA CERV 1/2", totalAferido: 1000, qtFaltante: 0, qtQualidade: 0, defeitos: {},
  ...o,
});

const precos = new Map([["A", 2], ["B", 3]]);
const lista = [
  af({ mapa: "1", qtFaltante: 10, qtQualidade: 5 }),
  af({ mapa: "1", itemCodigo: "B", itemDescricao: "GFA CERV 600", qtQualidade: 5 }),
  af({ mapa: "2", placa: "BBB2B22", motoristaNome: "MARIA", conferenteNome: "Lucas Moraes Pereira", qtFaltante: 1 }),
  af({ mapa: "3", placa: null, motoristaNome: null, conferenteNome: null }),
];

console.log("== POR PLACA ==");
let r = agruparAfericoes(lista, (a) => a.placa, precos);
eq("tres grupos (inclui sem placa)", r.length, 3);
eq("maior refugo primeiro", r[0].chave, "AAA1A11");
eq("refugo da AAA", r[0].refugo, 20);
eq("afericoes da AAA", r[0].afericoes, 2);
eq("mapas distintos da AAA (mesmo mapa, dois itens)", r[0].mapas, 1);
eq("pct da AAA: 20 de 2000", r[0].pct, 1);
eq("valor da AAA: 15x2 + 5x3", r[0].valor, 45);
eq("sem placa vira Nao informado", r.some((l) => l.chave === SEM_INFORMACAO), true);

console.log("\n== CONFERENTE COM CAIXA DIFERENTE ==");
r = agruparAfericoes(lista, (a) => a.conferenteNome, precos);
const lucas = r.find((l) => l.chave.toUpperCase() === "LUCAS MORAES PEREIRA");
eq("junta maiusculas e minusculas", lucas?.afericoes, 3);

console.log("\n== VALOR SEM PRECO ==");
r = agruparAfericoes([af({ itemCodigo: "Z", qtFaltante: 2 })], (a) => a.placa, precos);
eq("item sem preco anula o valor do grupo", r[0].valor, null);
r = agruparAfericoes([af({ itemCodigo: "Z", qtFaltante: 0 })], (a) => a.placa, precos);
eq("item sem preco mas sem refugo nao anula", r[0].valor, 0);
eq("nada aferido = pct nulo", agruparAfericoes([af({ totalAferido: 0 })], (a) => a.placa, precos)[0].pct, null);

console.log("\n== POR DATA ==");
eq("30 dias = dia", granularidadeDoPeriodo(30), "dia");
eq("90 dias = semana", granularidadeDoPeriodo(90), "semana");
eq("180 dias = mes", granularidadeDoPeriodo(180), "mes");
eq("segunda da semana de uma quarta", segundaDaSemana("2026-09-09"), "2026-09-07");
eq("segunda da semana de um domingo", segundaDaSemana("2026-09-13"), "2026-09-07");
eq("segunda continua segunda", segundaDaSemana("2026-09-07"), "2026-09-07");
eq("rotulo do mes", rotuloDoPeriodo("2026-08", "mes"), "ago/26");
eq("rotulo da semana", rotuloDoPeriodo("2026-09-07", "semana"), "sem 07/09");
const ev = evolucaoDoRefugo(
  [af({ data: "2026-09-01", qtFaltante: 1 }), af({ data: "2026-08-15" }), af({ data: "2026-09-20", qtQualidade: 2 })],
  "mes",
  precos,
);
eq("evolucao em ordem cronologica", ev.map((e) => e.chave).join(","), "2026-08,2026-09");
eq("setembro soma os dois dias", ev[1].refugo, 3);

console.log("\n== INCIDENCIA DO VEICULO ==");
const inc = incidenciaPorPlaca([
  af({ data: "2026-08-01", pctIncidenciaVeiculo: 4 }),
  af({ data: "2026-09-01", pctIncidenciaVeiculo: 7.9 }),
  af({ data: "2026-07-01", pctIncidenciaVeiculo: 11 }),
  af({ placa: "CCC", pctIncidenciaVeiculo: null }),
]);
eq("vale a afericao mais recente", inc.get("AAA1A11")?.pct, 7.9);
eq("placa sem incidencia fica de fora", inc.has("CCC"), false);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS CASOS PASSARAM");
if (falhas) process.exit(1);
