/**
 * O DIA DO ARQUIVO E O DAQUI, NAO O DE GREENWICH.
 * Rode: npx tsx src/lib/__testes__/dia-da-operacao.teste.mjs
 *
 * O dono baixou a planilha de produtos em 04/09/2026 a noite e o arquivo
 * saiu nomeado com 05. `toISOString()` devolve UTC, a Vercel roda em UTC,
 * e o armazem esta em UTC-3: das 21h a meia-noite daqui, o servidor ja
 * esta no dia seguinte.
 *
 * Este teste fixa as duas formas lado a lado no HORARIO EM QUE ELAS
 * DIVERGEM -- e o unico jeito de nao reintroduzir o erro sem esperar
 * anoitecer para descobrir.
 */
const diaUTC = (d) => d.toISOString().slice(0, 10);
const diaDaOperacao = (d) =>
  d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

console.log("== A NOITE DAQUI JA E AMANHA EM UTC ==");
// 04/09/2026 21:30 em Sao Paulo = 05/09/2026 00:30 UTC.
const aNoite = new Date("2026-09-05T00:30:00Z");
conferir("21h30 de 04/09 daqui, pelo fuso da operacao", diaDaOperacao(aNoite), "2026-09-04");
conferir("a mesma hora, em UTC (o defeito relatado)", diaUTC(aNoite), "2026-09-05");

console.log("\n== A VIRADA EXATA: 21h00 daqui ==");
// 21h00 daqui = 00h00 UTC. E o primeiro instante em que as duas divergem.
const virada = new Date("2026-09-05T00:00:00Z");
conferir("21h00 de 04/09 daqui", diaDaOperacao(virada), "2026-09-04");
// Um minuto antes ainda concordam.
const antes = new Date("2026-09-04T23:59:00Z");
conferir("20h59 de 04/09 daqui", diaDaOperacao(antes), "2026-09-04");
conferir("20h59, em UTC (ainda concordam)", diaUTC(antes), "2026-09-04");

console.log("\n== DE DIA AS DUAS CONCORDAM ==");
// 04/09 09:00 daqui = 12:00 UTC. E por isso que testar de manha esconde
// o defeito -- foi assim que ele passou.
const deManha = new Date("2026-09-04T12:00:00Z");
conferir("09h de 04/09, pelo fuso da operacao", diaDaOperacao(deManha), "2026-09-04");
conferir("09h de 04/09, em UTC", diaUTC(deManha), "2026-09-04");

console.log("\n== O FORMATO CONTINUA SENDO O QUE O NOME DE ARQUIVO ESPERA ==");
// "sv-SE" e o truque: e o locale que escreve ISO (AAAA-MM-DD) sem
// precisar remontar a data a mao.
conferir("formato", /^\d{4}-\d{2}-\d{2}$/.test(diaDaOperacao(aNoite)) ? "AAAA-MM-DD" : "outro", "AAAA-MM-DD");

console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} CASO(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
