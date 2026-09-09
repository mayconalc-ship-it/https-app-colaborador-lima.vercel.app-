// O perfil por hora do dia. O que se testa aqui e o FUSO e a
// distribuicao de intervalo -- os dois lugares onde um erro nao aparece
// como erro, aparece como um pico na hora errada.
//   npx tsx src/lib/__testes__/analise-horaria.teste.mjs
import { contagemPorHora, horaLocal, horasPorHora, mediaPorHora } from "../analise-horaria.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
function perto(nome, obtido, esperado, tolerancia = 0.01) {
  const ok = Math.abs(obtido - esperado) <= tolerancia;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ~${esperado}`);
}

console.log("== A HORA E A DA OPERACAO, NAO A DO SERVIDOR ==");

// O servidor da Vercel roda em UTC. Lida em UTC, a carreta que chegou as
// 21h no armazem apareceria a meia-noite -- no dia seguinte e no turno
// errado. Este e o teste que trava isso.
eq("21h local (00h UTC do dia seguinte)", horaLocal(new Date("2026-09-09T00:30:00Z")), 21);
eq("carimbo ja em -03:00", horaLocal(new Date("2026-09-09T07:15:00-03:00")), 7);
eq("meia-noite local", horaLocal(new Date("2026-09-09T00:10:00-03:00")), 0);

console.log("\n== CONTAGEM DE EVENTOS ==");

const chegadas = contagemPorHora([
  "2026-09-09T07:05:00-03:00",
  "2026-09-09T07:55:00-03:00",
  "2026-09-09T13:00:00-03:00",
  null,
  undefined,
  "nao e data",
]);
eq("duas chegadas as 7h", chegadas[7], 2);
eq("uma as 13h", chegadas[13], 1);
eq("nenhuma as 8h", chegadas[8], 0);
eq("nulo e lixo nao contam", chegadas.reduce((s, v) => s + v, 0), 3);

console.log("\n== INTERVALO SE ESPALHA PELAS HORAS ==");

// Uma operacao das 6h40 as 9h20 nao aconteceu toda as 6h. Contar so o
// inicio poria as 2h40 inteiras na hora 6 e o pico apareceria uma hora
// cedo demais -- que e o erro que este bloco existe para pegar.
const espalhado = horasPorHora([
  { inicio: "2026-09-09T06:40:00-03:00", fim: "2026-09-09T09:20:00-03:00" },
]);
perto("6h fica com 20 minutos", espalhado[6], 0.33, 0.02);
perto("7h fica com uma hora cheia", espalhado[7], 1);
perto("8h fica com uma hora cheia", espalhado[8], 1);
perto("9h fica com 20 minutos", espalhado[9], 0.33, 0.02);
perto("o total bate com a duracao", espalhado.reduce((s, v) => s + v, 0), 2.667, 0.02);

// O ultimo passo parcial: 10 minutos nao podem virar 15, senao a soma do
// perfil nao fecha com o total de horas dos cartoes.
const curto = horasPorHora([
  { inicio: "2026-09-09T10:00:00-03:00", fim: "2026-09-09T10:10:00-03:00" },
]);
perto("dez minutos sao dez minutos", curto[10], 0.167, 0.01);

// Operacao que ninguem fechou: sem o limite, um registro esquecido
// achataria o perfil inteiro em 24 barras iguais.
const esquecida = horasPorHora(
  [{ inicio: "2026-09-09T08:00:00-03:00", fim: "2026-09-14T08:00:00-03:00" }],
  24,
);
perto("o limite corta em 24h", esquecida.reduce((s, v) => s + v, 0), 24, 0.05);

eq("sem fim nao entra", horasPorHora([{ inicio: "2026-09-09T08:00:00-03:00", fim: null }])[8], 0);
eq("fim antes do inicio nao entra",
  horasPorHora([{ inicio: "2026-09-09T08:00:00-03:00", fim: "2026-09-09T07:00:00-03:00" }])[8], 0);

console.log("\n== PESO: DISTRIBUI O HORIMETRO, NAO O RELOGIO ==");

// A operacao ficou aberta 4h (06h-10h) mas o motor rodou 2h. O perfil
// tem de somar 2, nao 4 -- senao o grafico responde "quando a maquina
// esteve atribuida a alguem" fingindo responder "quando ela foi usada".
const comPeso = horasPorHora([
  { inicio: "2026-09-09T06:00:00-03:00", fim: "2026-09-09T10:00:00-03:00", peso: 2 },
]);
perto("o total e o horimetro", comPeso.reduce((s, v) => s + v, 0), 2, 0.02);
perto("meia hora de motor em cada hora aberta", comPeso[6], 0.5);
perto("e o mesmo nas outras tres", comPeso[9], 0.5);
eq("nada fora do intervalo", comPeso[11], 0);

// Sem peso continua sendo o tempo de relogio -- o comportamento antigo.
const semPeso = horasPorHora([
  { inicio: "2026-09-09T06:00:00-03:00", fim: "2026-09-09T10:00:00-03:00" },
]);
perto("sem peso, o total e o relogio", semPeso.reduce((s, v) => s + v, 0), 4, 0.02);

// Horimetro parado: a operacao existiu, mas a maquina nao rodou. Contar
// as horas de relogio no lugar inventaria uso.
eq("peso zero nao desenha nada",
  horasPorHora([{ inicio: "2026-09-09T06:00:00-03:00", fim: "2026-09-09T10:00:00-03:00", peso: 0 }])[6], 0);

console.log("\n== MEDIA POR HORA: SEM AMOSTRA E NULL, NAO ZERO ==");

// Zero as 3h seria lido como "as 3h a carreta sai na hora". O que houve
// foi nenhuma carreta as 3h, e as duas coisas nao se parecem.
const tma = mediaPorHora([
  { instante: "2026-09-09T07:10:00-03:00", valor: 60 },
  { instante: "2026-09-09T07:50:00-03:00", valor: 120 },
  { instante: "2026-09-09T15:00:00-03:00", valor: 45 },
  { instante: "2026-09-09T16:00:00-03:00", valor: null },
  { instante: null, valor: 999 },
]);
eq("media das 7h", tma[7], 90);
eq("uma amostra as 15h", tma[15], 45);
eq("hora sem amostra e null", tma[3], null);
eq("valor nulo nao cria amostra", tma[16], null);
eq("instante nulo nao entra em lugar nenhum", tma.filter((v) => v !== null).length, 2);

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
