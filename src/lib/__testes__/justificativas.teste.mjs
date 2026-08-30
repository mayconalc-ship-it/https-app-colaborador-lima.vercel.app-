// A lista unificada de justificativas. O que se testa aqui e a ORDEM e a
// contagem -- se a leitura da lideranca comecar pelo caso errado, a tela
// nao serve para nada.
//   npx tsx src/lib/__testes__/justificativas.teste.mjs
import {
  ordenarPorFato, contarPorIndicador, contarPorPessoa, ehIndicador,
  INDICADORES, ROTULO_INDICADOR,
} from "../justificativas.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}${ok ? "" : `: obtido ${a}, esperado ${b}`}`);
}
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}

const j = (id, indicador, data, criadoEm, colaboradorId, nome, grave = false) => ({
  id, indicador, data, criadoEm, colaboradorId, colaboradorNome: nome,
  papel: "motorista", texto: "t", contexto: "c", grave,
});

console.log("== ORDEM ==");
const lista = [
  j("a", "rating", "2026-08-10", "2026-08-11T10:00:00Z", "p1", "ANA"),
  j("b", "refugo", "2026-08-20", "2026-08-20T09:00:00Z", "p2", "BRUNO"),
  j("c", "devolucao", "2026-08-15", "2026-08-15T08:00:00Z", "p1", "ANA"),
];
eq("mais recente pelo FATO primeiro", ordenarPorFato(lista).map((x) => x.id), ["b", "c", "a"]);

// Duas do mesmo dia: desempata pelo envio, mais novo primeiro.
const mesmoDia = [
  j("velha", "rating", "2026-08-20", "2026-08-20T08:00:00Z", "p1", "ANA"),
  j("nova", "rating", "2026-08-20", "2026-08-20T18:00:00Z", "p1", "ANA"),
];
eq("mesmo dia desempata pelo envio", ordenarPorFato(mesmoDia).map((x) => x.id), ["nova", "velha"]);

// Ordenar nao pode mexer no array de quem chamou.
const original = [...lista];
ordenarPorFato(lista);
eq("nao altera a lista recebida", lista.map((x) => x.id), original.map((x) => x.id));

console.log("\n== CONTAGEM POR INDICADOR ==");
eq("conta os tres", contarPorIndicador(lista), { rating: 1, devolucao: 1, refugo: 1 });
eq("lista vazia zera tudo", contarPorIndicador([]), { rating: 0, devolucao: 0, refugo: 0 });

console.log("\n== CONTAGEM POR PESSOA ==");
const comGraves = [
  j("1", "rating", "2026-08-10", "2026-08-10T10:00:00Z", "p1", "ANA", true),
  j("2", "refugo", "2026-08-11", "2026-08-11T10:00:00Z", "p1", "ANA", false),
  j("3", "devolucao", "2026-08-12", "2026-08-12T10:00:00Z", "p2", "BRUNO", true),
];
eq("agrupa por pessoa, maior primeiro", contarPorPessoa(comGraves), [
  { nome: "ANA", total: 2, graves: 1 },
  { nome: "BRUNO", total: 1, graves: 1 },
]);
// Mesmo nome em ids diferentes sao pessoas diferentes -- agrupar por
// nome juntaria dois homonimos numa linha so.
eq("agrupa por id, nao por nome", contarPorPessoa([
  j("1", "rating", "2026-08-10", "2026-08-10T10:00:00Z", "p1", "JOSE"),
  j("2", "rating", "2026-08-10", "2026-08-10T10:00:00Z", "p2", "JOSE"),
]).length, 2);

console.log("\n== VALIDACAO DO FILTRO ==");
ok("rating vale", ehIndicador("rating"));
ok("texto qualquer nao vale", !ehIndicador("qualquer"));
ok("indefinido nao vale", !ehIndicador(undefined));
ok("todo indicador tem rotulo", INDICADORES.every((i) => !!ROTULO_INDICADOR[i]));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
