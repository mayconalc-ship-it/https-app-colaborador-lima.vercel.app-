// A conciliacao do Ativo de Giro: contado + transito - parque, e o
// limite de 5% do parque. O que este teste guarda: o transito SOMA (sem
// ele todo dia com carreta na estrada acusava falta), o percentual e
// sobre o PARQUE, e dia sem contagem nao vira dia com problema.
//   npx tsx src/lib/__testes__/conciliacao-ag.teste.mjs
import {
  conciliar, resumirConciliacao, conciliarPorDia, transitoDeLinhas,
  LIMITE_DIFERENCA_PCT,
} from "../ativo-giro.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Fatores: 1 palete = 100 caixas, 1 lastro = 10.
const fatores = {
  "600ml": { palete: 100, lastro: 10 },
  "300ml": { palete: 100, lastro: 10 },
  "1000ml": { palete: 100, lastro: 10 },
  "Verde": { palete: 100, lastro: 10 },
};
// Contagem: 10 paletes = 1000 caixas.
const c = (formato, palete, lastro = 0, caixa = 0, data = "2026-09-03") => ({
  data, tipo: "Kit AG", formato, status: "Cheio", palete, lastro, caixa,
});
const so = (linhas, formato) => linhas.find((l) => l.formato === formato);

console.log("== O TRANSITO SOMA ==");
// 900 contadas, 100 em transito, parque de 1000: fecha exato.
const comTransito = conciliar([c("600ml", 9)], { "Kit AG|600ml": 1000 }, fatores, { "Kit AG|600ml": 100 });
eq("contado + transito - parque", so(comTransito, "600ml").diferenca, 0);
eq("dentro do aceitavel", so(comTransito, "600ml").dentroDoAceitavel, true);

// Sem o transito, a MESMA operacao acusaria 100 caixas de falta.
const semTransito = conciliar([c("600ml", 9)], { "Kit AG|600ml": 1000 }, fatores);
eq("sem transito, acusa falta", so(semTransito, "600ml").diferenca, -100);
eq("e 10% do parque", so(semTransito, "600ml").pctDiferenca, 10);
eq("10% passa do limite", so(semTransito, "600ml").dentroDoAceitavel, false);

console.log("\n== O LIMITE E SOBRE O PARQUE ==");
// 50 de diferenca em 1000 = 5%, exatamente no limite -> aceitavel.
const noLimite = conciliar([c("600ml", 9, 5)], { "Kit AG|600ml": 1000 }, fatores);
eq("950 contadas, parque 1000", so(noLimite, "600ml").diferenca, -50);
eq(`${LIMITE_DIFERENCA_PCT}% cravado ainda e aceitavel`, so(noLimite, "600ml").dentroDoAceitavel, true);
// 51 -> 5,1%, fora.
const passou = conciliar([c("600ml", 9, 4, 9)], { "Kit AG|600ml": 1000 }, fatores);
eq("949 contadas -> 5,1%", so(passou, "600ml").pctDiferenca, 5.1);
eq("5,1% ja e vermelho", so(passou, "600ml").dentroDoAceitavel, false);

console.log("\n== SOBRA TAMBEM E DIFERENCA ==");
const sobra = conciliar([c("600ml", 12)], { "Kit AG|600ml": 1000 }, fatores);
eq("contou mais do que o parque", so(sobra, "600ml").diferenca, 200);
// O percentual e em MODULO: 20% de sobra e tao fora quanto 20% de falta.
eq("percentual e em modulo", so(sobra, "600ml").pctDiferenca, 20);
eq("sobra grande tambem e vermelha", so(sobra, "600ml").dentroDoAceitavel, false);

console.log("\n== SEM PARQUE NAO AFIRMA NADA ==");
// Dividir por zero nao da "0% de erro", da pergunta sem resposta.
const semParque = conciliar([c("600ml", 1)], {}, fatores);
eq("sem parque, sem percentual", so(semParque, "600ml").pctDiferenca, null);
eq("e sem verde nem vermelho", so(semParque, "600ml").dentroDoAceitavel, null);

console.log("\n== LINHA VAZIA NAO APARECE ==");
eq("nada em lugar nenhum some da tela", conciliar([], {}, fatores).length, 0);
// Mas so transito ja e motivo para a linha existir -- e um numero que
// alguem lancou e precisa ver.
eq("so transito ja mostra a linha",
  conciliar([], {}, fatores, { "Kit AG|600ml": 50 }).length, 1);

console.log("\n== O RESUMO SOMA ANTES DE DIVIDIR ==");
// Duas linhas: uma de 100 caixas com 50% de erro, outra de 10.000 com 1%.
// Media de porcentagens daria 25,5%. Somando primeiro, e 1,49%.
const resumo = resumirConciliacao([
  { tipo: "Kit AG", formato: "600ml", contado: 50, transito: 0, parque: 100, diferenca: -50, pctDiferenca: 50, dentroDoAceitavel: false },
  { tipo: "Kit AG", formato: "300ml", contado: 9900, transito: 0, parque: 10000, diferenca: -100, pctDiferenca: 1, dentroDoAceitavel: true },
]);
eq("diferenca total", resumo.diferenca, -150);
eq("percentual do total soma antes de dividir", resumo.pctDiferenca, 1.5);
eq("o total esta dentro", resumo.dentroDoAceitavel, true);
// Mas a tela precisa dizer que UMA linha estourou -- senao o total
// aceitavel esconderia o problema pequeno em volume e grande em conta.
eq("conta as linhas fora", resumo.linhasFora, 1);

console.log("\n== HISTORICO: DIA SEM CONTAGEM NAO E DIA COM PROBLEMA ==");
const dias = conciliarPorDia(
  [c("600ml", 10, 0, 0, "2026-09-03"), c("600ml", 9, 0, 0, "2026-09-01")],
  { "Kit AG|600ml": 1000 },
  fatores,
  { "2026-09-01": { "Kit AG|600ml": 100 } },
);
eq("so os dias contados entram", dias.map((d) => d.dia), ["2026-09-03", "2026-09-01"]);
eq("dia 03 fecha exato", dias[0].diferenca, 0);
// O transito lancado no dia 01 entra so no dia 01.
eq("dia 01 fecha com o transito dele", dias[1].diferenca, 0);
// Domingo (02) nao existe na lista -- nao houve medicao, nao ha queda.
eq("dia sem contagem nao vira linha", dias.some((d) => d.dia === "2026-09-02"), false);

console.log("\n== LER O TRANSITO DO BANCO ==");
eq("indexa por tipo|formato",
  transitoDeLinhas([{ tipo: "Kit AG", formato: "600ml", quantidade: 42 }]),
  { "Kit AG|600ml": 42 });
eq("nulo nao quebra", transitoDeLinhas(null), {});

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
