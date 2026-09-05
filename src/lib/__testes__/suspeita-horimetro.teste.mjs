// A conta que a auditoria faz olhando inicio e fim da operacao.
//   npx tsx src/lib/__testes__/suspeita-horimetro.teste.mjs
//
// A tela do Admin passou a mostrar inicio e fim numa linha so, para
// auditar (pedido do dono, 05/09/2026). Este e o numero entre os dois --
// e o que denuncia o ponto decimal esquecido sem ninguem subtrair de
// cabeca. Um alerta que dispara errado seria pior que alerta nenhum:
// ou vira barulho ignorado, ou faz corrigir o que estava certo.
import { suspeitaNoHorimetro, SALTO_SUSPEITO_HORAS } from "../empilhadeira-gas.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}

console.log("== O TURNO NORMAL NAO ACUSA NADA ==");
const turno = suspeitaNoHorimetro(5485.0, 5492.5);
eq("7,5 h rodadas", turno.horas, 7.5);
ok("nao e suspeito", !turno.suspeito);
ok("nao traz motivo", turno.motivo === undefined);
eq("texto em portugues, com virgula", turno.texto, "7,5 h rodadas");

console.log("\n== O PONTO DECIMAL ESQUECIDO ==");
// 5485,0 digitado como 54850 no FIM: o caso real que motivou a correcao
// de horimetro em 27/08/2026.
const semPonto = suspeitaNoHorimetro(5485.0, 54850);
ok("acusa", semPonto.suspeito);
ok("explica o ponto decimal", semPonto.motivo.includes("ponto decimal"));

console.log("\n== O FIM MENOR QUE O INICIO ==");
const paraTras = suspeitaNoHorimetro(5492.5, 5485.0);
eq("diferenca negativa", paraTras.horas, -7.5);
ok("acusa", paraTras.suspeito);
ok("diz que nao anda para tras", paraTras.motivo.includes("para tras") || paraTras.motivo.includes("para trás"));

console.log("\n== A BORDA DAS 24 HORAS ==");
// O teto ENTRA: exatamente 24h e um turno longo, nao um erro. Acima
// disso, nenhum turno explica.
ok(`${SALTO_SUSPEITO_HORAS}h exatas nao acusam`, !suspeitaNoHorimetro(1000, 1000 + SALTO_SUSPEITO_HORAS).suspeito);
ok("24,1 h acusa", suspeitaNoHorimetro(1000, 1024.1).suspeito);

console.log("\n== OPERACAO EM ABERTO NAO TEM O QUE CONFERIR ==");
// Mostrar "0 h" aqui seria AFIRMAR que a maquina nao rodou -- e outra
// coisa que "ainda nao fechou".
eq("sem fim", suspeitaNoHorimetro(5485.0, null), null);
eq("sem inicio", suspeitaNoHorimetro(null, 5492.5), null);
eq("sem nenhum dos dois", suspeitaNoHorimetro(null, null), null);

console.log("\n== ZERO RODADO E UM NUMERO VALIDO ==");
// Pegou e largou sem usar: estranho para o supervisor, mas nao e erro
// de digitacao -- e a tela nao deve gritar por isso.
const zero = suspeitaNoHorimetro(5485.0, 5485.0);
eq("zero", zero.horas, 0);
ok("nao acusa", !zero.suspeito);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
