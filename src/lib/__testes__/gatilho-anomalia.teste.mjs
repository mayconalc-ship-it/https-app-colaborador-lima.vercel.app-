// O motor do gatilho de anomalia, contra numeros conhecidos.
//   npx tsx src/lib/__testes__/gatilho-anomalia.teste.mjs
//
// Este e o teste que decide se o modulo nasce confiavel. Um gatilho que
// dispara errado tem dois custos, e os dois matam: alarme falso ensina a
// liderança a ignorar o painel, e alarme que NAO dispara deixa o desvio
// virar rotina. Por isso as bordas estao todas aqui.
import {
  calcularBase,
  limiteDoGatilho,
  avaliarSerie,
  foraDoLimite,
  MINIMO_DE_PONTOS,
  SIGMAS_PADRAO,
} from "../gatilho-anomalia.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}
const serie = (valores) =>
  valores.map((valor, i) => ({ dia: `2026-08-${String(i + 1).padStart(2, "0")}`, valor }));

console.log("== A CONTA, CONFERIDA NA MAO ==");
// 20 valores: dez 4 e dez 6. Media 5. Desvio AMOSTRAL (n-1):
// soma dos quadrados = 20 * 1 = 20; 20/19 = 1,0526; raiz = 1,0260.
const base = calcularBase([...Array(10).fill(4), ...Array(10).fill(6)]);
eq("pontos", base.pontos, 20);
eq("media", base.media, 5);
eq("desvio amostral (n-1)", base.desvio, 1.03);
ok("confiavel", base.confiavel);
// Populacional (n) daria 1,00 -- e apertaria o limite, produzindo alarme
// falso. O teste fixa a escolha.
ok("nao usa o desvio populacional (1,00)", base.desvio !== 1);

console.log("\n== SEM AMOSTRA, NAO DISPARA ==");
const poucos = calcularBase([1, 2, 3, 4, 5]);
ok("nao confiavel", !poucos.confiavel);
ok("diz quantos faltam", poucos.motivo.includes(`de ${MINIMO_DE_PONTOS}`));
eq(
  "sem limite",
  limiteDoGatilho(poucos, { sentido: "menor_melhor", sigmas: SIGMAS_PADRAO }),
  null,
);
eq(
  "19 pontos ainda nao bastam",
  calcularBase(Array(MINIMO_DE_PONTOS - 1).fill(3).map((v, i) => v + i * 0.1)).confiavel,
  false,
);
eq(
  "20 pontos bastam",
  calcularBase(Array(MINIMO_DE_PONTOS).fill(3).map((v, i) => v + i * 0.1)).confiavel,
  true,
);

console.log("\n== VARIACAO ZERO NAO VIRA GATILHO ==");
// Todo mundo igual: o limite cairia em cima da media, e qualquer casa
// decimal viraria anomalia.
const parado = calcularBase(Array(30).fill(7));
ok("nao confiavel", !parado.confiavel);
ok("explica que falta variacao", parado.motivo.includes("variação"));

console.log("\n== O LADO: MENOR E MELHOR (avaria, TMA, refugo) ==");
const g1 = { sentido: "menor_melhor", sigmas: 2 };
eq("limite e media + 2 desvios", limiteDoGatilho(base, g1), 7.06);
ok("acima do limite dispara", foraDoLimite(8, 7.06, "menor_melhor"));
ok("abaixo do limite nao dispara", !foraDoLimite(3, 7.06, "menor_melhor"));
ok("EMPATE nao dispara (o limite ainda e aceitavel)", !foraDoLimite(7.06, 7.06, "menor_melhor"));

console.log("\n== O LADO: MAIOR E MELHOR (HL/hora, nota do rating) ==");
// Aqui o desvio ruim e para BAIXO. Com a formula unica do pedido, este
// indicador nunca dispararia.
const g2 = { sentido: "maior_melhor", sigmas: 2 };
eq("limite e media - 2 desvios", limiteDoGatilho(base, g2), 2.94);
ok("abaixo do limite dispara", foraDoLimite(2, 2.94, "maior_melhor"));
ok("acima do limite nao dispara", !foraDoLimite(9, 2.94, "maior_melhor"));

console.log("\n== REGRA 1: O PICO ==");
// 20 medicoes estaveis de avaria, e a de hoje disparada.
const estavel = [2, 2.2, 1.8, 2.1, 1.9, 2, 2.3, 1.7, 2, 2.1, 1.9, 2.2, 2, 1.8, 2.1, 2, 2.2, 1.9, 2, 2.1];
const pico = avaliarSerie(serie([...estavel, 9]), g1);
ok("disparou", Boolean(pico.disparo));
eq("pela regra do pico", pico.disparo.regra, "pico");
eq("o ponto e o de hoje", pico.disparo.ponto.valor, 9);
ok("a explicacao mostra a conta", pico.disparo.explicacao.includes("média"));
ok("dia normal NAO dispara", avaliarSerie(serie([...estavel, 2]), g1).disparo === null);

console.log("\n== REGRA 2: A DERIVA (2 de 3 alem de 1 desvio) ==");
/*
  O cenario tem de ser montado com cuidado: os tres ultimos pontos
  precisam cair ENTRE 1 e 2 desvios. Acima de 2 ja seria pico, e o teste
  passaria pelo motivo errado -- foi o que aconteceu na primeira versao
  deste arquivo.

  Por isso as linhas sao calculadas da propria serie (a base muda quando
  os pontos novos entram) e o cenario e CONFERIDO antes da asserção que
  importa. Se um dia alguem mexer nos numeros, o teste acusa a montagem,
  nao o motor.
*/
const valoresDeriva = [...estavel, 2.28, 2.24, 2.3];
const baseDeriva = calcularBase(valoresDeriva);
const limite2 = limiteDoGatilho(baseDeriva, g1);
const limite1 = Math.round((baseDeriva.media + baseDeriva.desvio) * 100) / 100;
console.log(`     (media ${baseDeriva.media}, desvio ${baseDeriva.desvio}, 1σ=${limite1}, 2σ=${limite2})`);
const ultimosTres = valoresDeriva.slice(-3);
ok("montagem: os tres ultimos passam de 1 desvio", ultimosTres.every((v) => v > limite1));
ok("montagem: e NENHUM passa de 2 desvios", ultimosTres.every((v) => v <= limite2));

const deriva = avaliarSerie(serie(valoresDeriva), g1);
ok("disparou", Boolean(deriva.disparo));
eq("pela regra da deriva, nao pelo pico", deriva.disparo.regra, "deriva");

// A janela que JA normalizou nao pode continuar cobrando relato: dois
// pontos velhos afastados, mas o de hoje dentro.
const normalizou = avaliarSerie(serie([...estavel, 2.28, 2.24, 1.9]), g1);
ok("dois afastados, mas hoje normal: nao dispara", normalizou.disparo === null);

console.log("\n== O LIMITE ESCRITO A MAO MANDA NA FORMULA ==");
/*
  "Avaria acima de 5% a gente trata, e ponto."

  A serie aqui e a sintetica (media 5, desvio 1,03, limite estatistico
  7,06) de proposito: com ela, o valor 6 fica ABAIXO do limite calculado
  e ACIMA do limite escrito a mao. E o unico jeito de provar que quem
  mandou foi o numero do dono, e nao a estatistica.
*/
const vinte = [...Array(10).fill(4), ...Array(10).fill(6)];
const manual = { sentido: "menor_melhor", sigmas: 2, limiteManual: 5 };
const comManual = avaliarSerie(serie([...vinte, 6]), manual);
eq("usa o limite escolhido", comManual.limite, 5);
ok("marcado como manual", comManual.limiteManual);
eq("disparou por ele", comManual.disparo.regra, "pico");
ok("a explicacao cita o limite definido", comManual.disparo.explicacao.includes("definido"));
const semManual = avaliarSerie(serie([...vinte, 6]), g1);
ok(`montagem: o limite estatistico (${semManual.limite}) e maior que o manual (5)`, semManual.limite > 5);
ok("sem o manual, esse mesmo ponto NAO dispararia", semManual.disparo === null);

// A deriva nao roda com limite manual: nao existe "1 sigma" de um numero
// escolhido a mao.
ok(
  "manual nao dispara por deriva",
  avaliarSerie(serie(valoresDeriva), manual).disparo === null,
);

console.log("\n== O LIMITE MANUAL VALE MESMO SEM BASE ==");
// Indicador novo, tres medicoes: a estatistica nao julga, mas "acima de
// 5% a gente trata" continua valendo desde o primeiro dia.
const novo = avaliarSerie(serie([1, 2, 9]), manual);
eq("tem limite", novo.limite, 5);
ok("base ainda nao confiavel", !novo.base.confiavel);
ok("mesmo assim dispara", Boolean(novo.disparo));

console.log("\n== SERIE VAZIA NAO QUEBRA ==");
const vazia = avaliarSerie([], g1);
eq("sem disparo", vazia.disparo, null);
eq("sem pontos", vazia.base.pontos, 0);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
