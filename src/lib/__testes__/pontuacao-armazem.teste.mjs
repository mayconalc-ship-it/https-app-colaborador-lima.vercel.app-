// A PONTUACAO DO RANKING DO ARMAZEM.
//
// O dono disse que o ranking estava injusto. Estava, e o defeito era
// aritmetico: media SIMPLES de porcentagens, em dois niveis, nenhum deles
// olhando o tempo. Estes casos guardam o conserto.
//   npx tsx src/lib/__testes__/pontuacao-armazem.teste.mjs
import {
  mediaPonderadaPorHoras, calcularPontuacao, HORAS_MINIMAS_NO_RANKING, mediaPct,
} from "../produtividade-armazem.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("== A INJUSTICA QUE ISTO CONSERTA ==");
// Uma pessoa trabalhou 6h a 100% da meta e 10 minutos a 300%.
// A media SIMPLES daria 200 -- como se metade do dia dela tivesse sido a
// 300%. Ponderada pelas horas da 102,8, que e o ritmo real.
const dia = [
  { pct: 100, horas: 6 },
  { pct: 300, horas: 1 / 6 },
];
eq("media simples exagerava", mediaPct([100, 300]), 200);
eq("ponderada conta o que o dia foi", mediaPonderadaPorHoras(dia), 105.4);

// Quem faz MAIS atividades era penalizado: uma nota ruim pesava 1/5 em
// vez de pesar o tempo que ocupou.
const especialista = [{ pct: 120, horas: 8 }];
const generalista = [
  { pct: 120, horas: 7 },
  { pct: 60, horas: 1 },   // uma hora ruim num dia de oito
];
eq("especialista", mediaPonderadaPorHoras(especialista), 120);
eq("generalista quase nao e punido pela hora ruim", mediaPonderadaPorHoras(generalista), 112.5);
// Pela media simples o generalista cairia para 90 -- 30 pontos por uma
// hora em oito.
eq("media simples punia o generalista", mediaPct([120, 60]), 90);

console.log("\n== PARCELA SEM MEDICAO NAO ENTRA ==");
eq("pct nulo e ignorado", mediaPonderadaPorHoras([{ pct: null, horas: 5 }, { pct: 100, horas: 5 }]), 100);
// Hora zero nao pode entrar: seria peso zero, mas tambem abre divisao
// por zero se for a unica parcela.
eq("hora zero e ignorada", mediaPonderadaPorHoras([{ pct: 999, horas: 0 }, { pct: 100, horas: 2 }]), 100);
eq("nada medido e null", mediaPonderadaPorHoras([{ pct: null, horas: 3 }]), null);
eq("lista vazia e null", mediaPonderadaPorHoras([]), null);
eq("hora negativa e ignorada", mediaPonderadaPorHoras([{ pct: 500, horas: -2 }, { pct: 80, horas: 1 }]), 80);

console.log("\n== AMOSTRA CURTA NAO VIRA NOTA ==");
// Medido no dado real em 03/09/2026: um terco dos lancamentos dura menos
// de 3 minutos, e o menor tem 18 segundos. Uma taxa calculada em cima de
// 18 segundos descreve o arredondamento, nao o ritmo.
eq("limite documentado", HORAS_MINIMAS_NO_RANKING, 1);
eq("24 minutos nao viram nota", calcularPontuacao([{ pct: 400, horas: 0.4 }]), null);
eq("uma hora ja vira nota", calcularPontuacao([{ pct: 110, horas: 1 }]), 110);
// A soma das parcelas COM medicao e o que conta: 40 min + 30 min = 1h10.
eq("as parcelas somam para o minimo",
  calcularPontuacao([{ pct: 100, horas: 0.67 }, { pct: 100, horas: 0.5 }]), 100);
// Parcela sem pct nao ajuda a atingir o minimo -- ela nao foi medida.
eq("hora sem pct nao conta para o minimo",
  calcularPontuacao([{ pct: null, horas: 10 }, { pct: 150, horas: 0.2 }]), null);
eq("nada de nada e null", calcularPontuacao([]), null);

console.log("\n== O CASO REAL QUE DISPAROU ISTO ==");
// Denes: 0,4h em uma atividade. Lucas: 13,9h em tres.
// Antes os dois disputavam de igual para igual. Agora o de 24 minutos
// nao recebe nota, e o de 14 horas recebe.
const denes = calcularPontuacao([{ pct: 130, horas: 0.4 }]);
const lucas = calcularPontuacao([
  { pct: 105, horas: 8 },
  { pct: 95, horas: 4 },
  { pct: 120, horas: 1.9 },
]);
eq("Denes: amostra curta, sem nota", denes, null);
eq("Lucas: nota ponderada pelas 13,9h", lucas, 104);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
