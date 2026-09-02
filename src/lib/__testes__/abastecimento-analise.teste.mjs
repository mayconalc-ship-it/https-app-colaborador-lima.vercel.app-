// As perguntas do abastecimento do picking. O que este teste guarda: o
// FUSO (a Vercel roda em UTC, a operacao em UTC-3) e a recusa em inventar
// zero onde o dado falta.
//   npx tsx src/lib/__testes__/abastecimento-analise.teste.mjs
import {
  hlPorHora, porDia, porHora, porTipo, porTurno, porPessoa,
  resumirAtividade, diaDaOperacao, horaDaOperacao,
} from "../abastecimento-analise.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Horarios escritos no fuso da OPERACAO.
const T = (dia, hhmm) => `2026-09-${dia}T${hhmm}:00-03:00`;

function s(extra = {}) {
  return {
    id: "s1",
    colaboradorId: "p1",
    colaboradorNome: "LUCAS FERREIRA",
    tipo: "completo",
    turno: "manha",
    inicio: T("01", "08:00"),
    fim: T("01", "09:00"),
    deSolicitacao: false,
    hl: 30,
    paletes: 3,
    itens: 5,
    ...extra,
  };
}

console.log("== FUSO: a operacao e UTC-3, o servidor e UTC ==");
// 22h de 01/09 na operacao = 01h de 02/09 em UTC. O dia tem de continuar
// sendo 01: senao o fim de todo turno da noite cai no dia seguinte.
eq("22h da operacao ainda e o mesmo dia", diaDaOperacao("2026-09-01T22:00:00-03:00"), "2026-09-01");
eq("mesmo instante escrito em UTC", diaDaOperacao("2026-09-02T01:00:00.000Z"), "2026-09-01");
eq("hora da operacao, nao do servidor", horaDaOperacao("2026-09-02T01:00:00.000Z"), 22);
eq("8h da manha", horaDaOperacao(T("01", "08:00")), 8);

console.log("\n== HL POR HORA ==");
eq("30 HL em 1 hora", hlPorHora([s()]), 30);
eq("30 HL em 30 min = 60 HL/h", hlPorHora([s({ fim: T("01", "08:30") })]), 60);
// Sessao aberta nao entra: o tempo dela ainda esta correndo, e conta-la
// como zero minuto daria uma taxa infinita.
eq("sessao aberta nao entra", hlPorHora([s(), s({ id: "s2", fim: null, hl: 999 })]), 30);
// Sem tempo medido devolve null, nao zero: zero afirmaria que se
// trabalhou sem produzir.
eq("nada medido e null", hlPorHora([s({ fim: null })]), null);
eq("lista vazia e null", hlPorHora([]), null);

console.log("\n== POR DIA ==");
eq("um dia por linha, em ordem",
  porDia([s({ inicio: T("03", "08:00") }), s({ inicio: T("01", "08:00") })]).map((d) => d.dia),
  ["2026-09-01", "2026-09-03"]);
eq("soma o HL do dia",
  porDia([s(), s({ id: "s2", hl: 20 })])[0], { dia: "2026-09-01", hl: 50, sessoes: 2 });

console.log("\n== POR HORA ==");
// So as horas COM movimento: 24 posicoes com dezenove zeros escondem as
// cinco que interessam.
eq("so horas com movimento",
  porHora([s({ inicio: T("01", "08:00") }), s({ id: "s2", inicio: T("01", "14:00") })]).map((h) => h.hora),
  [8, 14]);
eq("agrupa a mesma hora",
  porHora([s({ inicio: T("01", "08:10") }), s({ id: "s2", inicio: T("01", "08:50") })]),
  [{ hora: 8, sessoes: 2, hl: 60 }]);

console.log("\n== COMPLETO x PONTUAL, NUNCA SOMADOS ==");
const doisTipos = porTipo([
  s({ tipo: "completo", fim: T("01", "10:00") }),           // 2h
  s({ id: "s2", tipo: "pontual", fim: T("01", "08:10") }),  // 10 min
]);
eq("uma linha por tipo", doisTipos.map((x) => x.chave), ["completo", "pontual"]);
eq("duracao do completo", doisTipos[0].duracaoMedia, 120);
eq("duracao do pontual", doisTipos[1].duracaoMedia, 10);
// A media dos dois seria 65 min -- um numero que nao descreve nem a
// varredura nem o chamado.

console.log("\n== POR TURNO, NA ORDEM DO DIA ==");
eq("manha, tarde, noite",
  porTurno([s({ turno: "noite" }), s({ id: "s2", turno: "manha" }), s({ id: "s3", turno: "tarde" })])
    .map((x) => x.chave),
  ["manha", "tarde", "noite"]);

console.log("\n== POR PESSOA ==");
const pessoas = porPessoa([
  s({ colaboradorId: "a", colaboradorNome: "ANA", hl: 10 }),
  s({ id: "s2", colaboradorId: "b", colaboradorNome: "BIA", hl: 40, deSolicitacao: true }),
  s({ id: "s3", colaboradorId: "a", colaboradorNome: "ANA", hl: 5 }),
]);
eq("ordenado pelo HL", pessoas.map((p) => p.colaboradorNome), ["BIA", "ANA"]);
eq("soma as sessoes da pessoa", pessoas[1].sessoes, 2);
eq("conta quantas vieram de pedido", pessoas[0].deSolicitacao, 1);

console.log("\n== RESUMO ==");
const r = resumirAtividade([
  s({ hl: 30 }),
  s({ id: "s2", inicio: T("02", "08:00"), fim: T("02", "09:00"), hl: 10, deSolicitacao: true }),
]);
eq("sessoes", r.sessoes, 2);
eq("HL", r.hl, 40);
eq("horas", r.horas, 2);
// Dias COM movimento: domingo parado nao pode derrubar a media de quem
// trabalhou.
eq("dias com movimento", r.diasComMovimento, 2);
eq("HL por dia", r.hlPorDia, 20);
eq("metade veio de pedido", r.pctDeSolicitacao, 50);
eq("periodo vazio nao inventa media", resumirAtividade([]).hlPorDia, null);
eq("periodo vazio nao inventa porcentagem", resumirAtividade([]).pctDeSolicitacao, null);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
