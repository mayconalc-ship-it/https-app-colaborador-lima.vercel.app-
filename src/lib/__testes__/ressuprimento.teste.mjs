// Ressuprimento do picking. O que este teste guarda, acima de tudo: o
// estado sai dos CARIMBOS, e um carimbo faltando nunca vira zero -- vira
// null. Zero num tempo e uma mentira que a media absorve sem reclamar.
//   npx tsx src/lib/__testes__/ressuprimento.teste.mjs
import {
  estadoDe, estaAberta, transporteFim, temposDoCiclo, minutosParadaAgora,
  ordenarFila, indicadoresDoOperador, indicadoresDoSolicitante, resumirPeriodo,
  resumirPorTipo,
} from "../ressuprimento.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
function ok(nome, cond, det = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${det ? ": " + det : ""}`);
}

// Base: 10:00 em UTC-3 (a operacao), gravado em UTC (o servidor).
const T = (hhmm) => `2026-09-02T${hhmm}:00.000Z`;

function item(id, entregueEm = null, hl = 10) {
  return { id, produtoId: `p${id}`, unidade: "palete", quantidade: 1, hl, entregueEm };
}

function base(extra = {}) {
  return {
    id: "r1",
    criadoEm: T("13:00"),
    solicitanteId: "s1",
    solicitanteNome: "CONFERENTE",
    prioridade: "normal",
    tipo: "completo",
    transporteInicio: null,
    operadorId: null,
    operadorNome: null,
    canceladoEm: null,
    itens: [item("a"), item("b")],
    abastecimentoInicio: null,
    abastecimentoFim: null,
    abastecedorNome: null,
    ...extra,
  };
}

console.log("== O ESTADO SAI DOS CARIMBOS ==");
eq("recem criada", estadoDe(base()), "aberta");
eq("operador aceitou", estadoDe(base({ transporteInicio: T("13:10"), operadorId: "o1" })), "em_transporte");
// UM item entregue nao e "na area": falta o outro, e e justamente essa
// viagem que fica escondida se a solicitacao mudar de estado cedo demais.
eq("so um item entregue continua em transporte",
  estadoDe(base({ transporteInicio: T("13:10"), itens: [item("a", T("13:20")), item("b")] })), "em_transporte");
eq("todos entregues",
  estadoDe(base({ transporteInicio: T("13:10"), itens: [item("a", T("13:20")), item("b", T("13:25"))] })), "na_area");
eq("ajudante comecou",
  estadoDe(base({ transporteInicio: T("13:10"), itens: [item("a", T("13:20")), item("b", T("13:25"))], abastecimentoInicio: T("13:40") })),
  "abastecendo");
eq("ajudante terminou",
  estadoDe(base({ transporteInicio: T("13:10"), itens: [item("a", T("13:20")), item("b", T("13:25"))], abastecimentoInicio: T("13:40"), abastecimentoFim: T("14:00") })),
  "concluida");
// Cancelar e um FATO novo, nao a ausencia de outro -- por isso vence
// qualquer carimbo que ja exista.
eq("cancelada vence tudo",
  estadoDe(base({ transporteInicio: T("13:10"), abastecimentoFim: T("14:00"), canceladoEm: T("14:10") })), "cancelada");

console.log("\n== FIM DO TRANSPORTE ==");
eq("null enquanto falta item", transporteFim({ itens: [item("a", T("13:20")), item("b")] }), null);
// O ultimo, nao o primeiro: o transporte so acabou quando o ultimo chegou.
eq("o mais recente vence", transporteFim({ itens: [item("a", T("13:25")), item("b", T("13:20"))] }), T("13:25"));
eq("solicitacao sem item nao tem fim", transporteFim({ itens: [] }), null);

console.log("\n== TEMPOS ==");
const completa = base({
  transporteInicio: T("13:10"),
  operadorId: "o1",
  operadorNome: "JOSE",
  itens: [item("a", T("13:20")), item("b", T("13:30"))],
  abastecimentoInicio: T("13:50"),
  abastecimentoFim: T("14:10"),
});
const t = temposDoCiclo(completa);
eq("espera pela empilhadeira", t.esperaEmpilhadeira, 10);
eq("transporte", t.transporte, 20);
eq("espera pelo ajudante", t.esperaAjudante, 20);
eq("abastecimento", t.abastecimento, 20);
eq("ciclo inteiro", t.ciclo, 70);
// 30 dos 70 minutos ninguem estava trabalhando. E o numero que muda
// decisao: nao se resolve treinando quem abastece.
eq("porcentagem de espera", t.pctEspera, 42.9);

console.log("\n== CARIMBO FALTANDO NAO VIRA ZERO ==");
const meio = temposDoCiclo(base({ transporteInicio: T("13:10") }));
eq("transporte sem entrega e null", meio.transporte, null);
eq("ciclo sem fim e null", meio.ciclo, null);
eq("sem ciclo nao ha % de espera", meio.pctEspera, null);
// Relogio ajustado / correcao manual: negativo contaminaria toda media
// que passasse por aqui, sem dar erro.
eq("carimbo fora de ordem vira null",
  temposDoCiclo(base({ transporteInicio: T("12:50") })).esperaEmpilhadeira, null);

console.log("\n== HA QUANTO TEMPO ESTA PARADA ==");
const agora = new Date(T("14:00"));
// Criada as 13:00, transporte comecou 13:10: esta parada ha 50 min
// esperando a entrega, nao ha 60 desde que nasceu. Contar desde a criacao
// faria a fila inteira parecer um incendio.
eq("conta desde a ULTIMA acao",
  minutosParadaAgora(base({ transporteInicio: T("13:10"), operadorId: "o1" }), agora), 50);
eq("recem criada conta desde a criacao", minutosParadaAgora(base(), agora), 60);
eq("concluida nao esta parada",
  minutosParadaAgora(completa, agora), null);
eq("cancelada nao esta parada", minutosParadaAgora(base({ canceladoEm: T("13:30") }), agora), null);

console.log("\n== FILA ==");
const fila = ordenarFila([
  base({ id: "velha-normal", criadoEm: T("10:00") }),
  base({ id: "nova-urgente", criadoEm: T("13:00"), prioridade: "urgente" }),
  base({ id: "media-normal", criadoEm: T("11:00") }),
  base({ id: "velha-urgente", criadoEm: T("09:00"), prioridade: "urgente" }),
]);
// Urgente primeiro; dentro de cada grupo, a mais velha na frente. So
// prioridade deixaria a normal envelhecer para sempre; so idade tornaria
// a prioridade decorativa.
eq("urgente na frente, mais velha primeiro",
  fila.map((r) => r.id),
  ["velha-urgente", "nova-urgente", "velha-normal", "media-normal"]);

console.log("\n== INDICADORES DO OPERADOR ==");
const doOperador = indicadoresDoOperador([
  completa,
  base({ id: "r2", transporteInicio: T("13:10"), operadorId: "o1", operadorNome: "JOSE",
    itens: [item("c", T("13:40"), 20)] }),
  // Sem entrega concluida: nao entra, senao a media de transporte cairia
  // por causa de uma viagem que ainda esta acontecendo.
  base({ id: "r3", transporteInicio: T("13:50"), operadorId: "o1", operadorNome: "JOSE" }),
]);
eq("uma linha por operador", doOperador.length, 1);
eq("so entregas concluidas contam", doOperador[0].entregas, 2);
eq("HL somado", doOperador[0].hl, 40);
eq("transporte medio", doOperador[0].transporteMedio, 25);

console.log("\n== RESUMO DO PERIODO ==");
const resumo = resumirPeriodo([completa, base({ id: "aberta" }), base({ id: "x", canceladoEm: T("13:30") })]);
eq("total", resumo.total, 3);
eq("concluidas", resumo.concluidas, 1);
eq("canceladas", resumo.canceladas, 1);
eq("abertas", resumo.abertas, 1);
eq("ciclo medio so das fechadas", resumo.cicloMedio, 70);

console.log("\n== COMPLETO E PONTUAL NAO SE MISTURAM ==");
// Uma varredura da manha de 2h e normal; um chamado pontual de 2h e um
// problema. Somados num "ciclo medio" so, o numero nao descreve nenhum
// dos dois -- e e justamente o numero que alguem usaria para cobrar a
// pessoa errada.
const porTipo = resumirPorTipo([
  completa,
  base({ id: "p1", tipo: "pontual", transporteInicio: T("13:05"), operadorId: "o2",
    itens: [item("z", T("13:10"))], abastecimentoInicio: T("13:12"), abastecimentoFim: T("13:20") }),
]);
eq("um resumo por tipo", porTipo.map((x) => x.tipo), ["completo", "pontual"]);
eq("ciclo do completo", porTipo[0].resumo.cicloMedio, 70);
eq("ciclo do pontual", porTipo[1].resumo.cicloMedio, 20);
// Tipo sem nenhuma solicitacao no periodo nao vira um bloco de zeros: um
// painel com metade das linhas zeradas ensina a ignora-lo.
eq("tipo sem movimento nao aparece", resumirPorTipo([completa]).map((x) => x.tipo), ["completo"]);
eq("periodo vazio nao gera bloco", resumirPorTipo([]), []);

console.log("\n== SOLICITANTE ==");
const doSolic = indicadoresDoSolicitante([completa, base({ id: "u", prioridade: "urgente" })]);
eq("uma linha", doSolic.length, 1);
eq("conta urgentes", doSolic[0].urgentes, 1);
eq("soma solicitacoes", doSolic[0].solicitacoes, 2);

console.log("\n== ABERTA OU NAO ==");
ok("aberta esta aberta", estaAberta(base()));
ok("concluida nao", !estaAberta(completa));
ok("cancelada nao", !estaAberta(base({ canceladoEm: T("13:30") })));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
