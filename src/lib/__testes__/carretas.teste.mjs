// A regra do TMA, que ja mudou tres vezes. Cada troca aqui e uma decisao
// de operacao, nao de codigo -- por isso vale um teste que fale a lingua
// da operacao.
//   npx tsx src/lib/__testes__/carretas.teste.mjs
import {
  calcularTmaMinutos,
  calcularEsperaPortariaMinutos,
  calcularTempoDescargaMinutos,
  calcularTempoCargaMinutos,
} from "../carretas.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

const h = (hhmm) => `2026-08-29T${hhmm}:00-03:00`;

console.log("== ONDE O TMA TERMINA ==");

// Sem retorno: a carreta vai embora quando a descarga acaba.
eq("sem carga, acaba na descarga",
  calcularTmaMinutos({
    chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("09:00"), temCarga: false, fimCargaEm: null,
  }), 60);

// Com carga de AG: so esta liberada quando o carregamento fecha.
eq("com carga, acaba no carregamento",
  calcularTmaMinutos({
    chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("09:00"), temCarga: true, fimCargaEm: h("09:40"),
  }), 100);

// O vao entre descarga e carga CONTA: a carreta esta parada no patio.
eq("o vao entre descarga e carga conta",
  calcularTmaMinutos({
    chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("09:00"), temCarga: true, fimCargaEm: h("10:00"),
  }), 120);

// Carregando ainda: o atendimento nao acabou, entao nao ha TMA. Mostrar
// o tempo ate a descarga seria um numero menor que a realidade.
eq("com carga em andamento, ainda nao ha TMA",
  calcularTmaMinutos({
    chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("09:00"), temCarga: true, fimCargaEm: null,
  }), null);

eq("sem descarga concluida, nao ha TMA",
  calcularTmaMinutos({
    chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: null, temCarga: false, fimCargaEm: null,
  }), null);

console.log("\n== ONDE O TMA COMECA ==");
eq("agendada conta do horario agendado",
  calcularTmaMinutos({
    chegadaEm: h("13:47"), cargaAgendada: true, agendamentoEm: h("14:00"),
    fimDescargaEm: h("14:57"), temCarga: false, fimCargaEm: null,
  }), 57);

eq("nao agendada conta da chegada",
  calcularTmaMinutos({
    chegadaEm: h("13:47"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("14:57"), temCarga: false, fimCargaEm: null,
  }), 70);

// Marcada como agendada mas sem horario: cai na chegada, em vez de
// quebrar ou usar zero.
eq("agendada sem horario cai na chegada",
  calcularTmaMinutos({
    chegadaEm: h("13:47"), cargaAgendada: true, agendamentoEm: null,
    fimDescargaEm: h("14:57"), temCarga: false, fimCargaEm: null,
  }), 70);

console.log("\n== O CASO REAL: DT 741490 ==");
// Agendada 14:00, chegou 13:47, descarga ate 14:57, carga ate 15:39.
// Pela regra antiga dava 58 min para uma carreta que passou 1h52 no patio.
const dt741490 = {
  chegadaEm: "2026-08-29T13:47:30-03:00",
  cargaAgendada: true,
  agendamentoEm: "2026-08-29T14:00:00-03:00",
  inicioDescargaEm: "2026-08-29T14:33:51-03:00",
  fimDescargaEm: "2026-08-29T14:57:35-03:00",
  inicioConferenciaEm: "2026-08-29T15:04:16-03:00",
  fimConferenciaEm: "2026-08-29T15:37:52-03:00",
  temCarga: true,
  inicioCargaEm: "2026-08-29T14:57:35-03:00",
  fimCargaEm: "2026-08-29T15:39:12-03:00",
};
eq("TMA", calcularTmaMinutos(dt741490), 99);
eq("espera na portaria", calcularEsperaPortariaMinutos(dt741490), 46);
eq("descarga", calcularTempoDescargaMinutos(dt741490), 24);
eq("carga", calcularTempoCargaMinutos(dt741490), 42);

console.log("\n== A CONFERENCIA NUNCA ENTRA ==");
// Caso da DT 741087: conferencia terminou 2h depois de a carreta sair.
eq("conferencia longa nao infla o TMA",
  calcularTmaMinutos({
    chegadaEm: h("17:45"), cargaAgendada: false, agendamentoEm: null,
    fimDescargaEm: h("18:39"),
    fimConferenciaEm: h("20:56"), // 2h depois -- nao pode contar
    temCarga: true, fimCargaEm: h("19:25"),
  }), 100);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
