// A regra do TMA, que ja mudou tres vezes. Cada troca aqui e uma decisao
// de operacao, nao de codigo -- por isso vale um teste que fale a lingua
// da operacao.
//   npx tsx src/lib/__testes__/carretas.teste.mjs
import {
  calcularTmaMinutos,
  tmaEmAndamentoMinutos,
  aguardandoAgendamento,
  corSinalizador,
  minutosAteEstourarTma,
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


console.log("\n== TMA CORRENDO NO MONITOR ==");
// Nao agendada: conta da chegada, igual ao relogio do card.
eq("nao agendada conta da chegada",
  tmaEmAndamentoMinutos(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null },
    new Date(h("10:00"))), 120);

// Agendada: conta do AGENDADO. E por isso que o TMA nao bate com o
// "Ha 2h52min" do card, que sempre conta da chegada.
eq("agendada conta do agendado",
  tmaEmAndamentoMinutos(
    { chegadaEm: h("07:30"), cargaAgendada: true, agendamentoEm: h("08:00") },
    new Date(h("10:00"))), 120);

// Chegou DEPOIS do agendado: o TMA ja comecou antes de ela chegar.
eq("chegou atrasada, TMA maior que o patio",
  tmaEmAndamentoMinutos(
    { chegadaEm: h("09:00"), cargaAgendada: true, agendamentoEm: h("08:00") },
    new Date(h("10:00"))), 120);

// Marcada como agendada sem horario: cai na chegada.
eq("agendada sem horario cai na chegada",
  tmaEmAndamentoMinutos(
    { chegadaEm: h("08:00"), cargaAgendada: true, agendamentoEm: null },
    new Date(h("09:00"))), 60);

console.log("\n== QUANTO FALTA PARA ESTOURAR ==");
eq("ainda dentro",
  minutosAteEstourarTma(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null }, 161,
    new Date(h("09:00"))), 101);

// Ja estourou: devolve NEGATIVO, nao zero. Zerar esconderia o caso que
// precisa de acao.
eq("ja estourou devolve negativo",
  minutosAteEstourarTma(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null }, 161,
    new Date(h("11:15"))), -34);

eq("exatamente no limite da zero",
  minutosAteEstourarTma(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null }, 60,
    new Date(h("09:00"))), 0);

console.log("\n== AGENDADA QUE AINDA NAO DEU A HORA ==");
// Chegou antes do agendado: o TMA nao comecou. Sem este estado o card
// mostrava "faltam 2h41min" -- o alvo inteiro -- como se o relogio
// estivesse correndo.
eq("chegou antes do agendado esta aguardando",
  aguardandoAgendamento(
    { cargaAgendada: true, agendamentoEm: h("10:00") }, new Date(h("09:00"))), true);

eq("passou da hora agendada NAO esta aguardando",
  aguardandoAgendamento(
    { cargaAgendada: true, agendamentoEm: h("10:00") }, new Date(h("10:01"))), false);

// No minuto exato ja comecou -- o agendamento e o inicio, nao um limite
// que ainda precisa ser ultrapassado.
eq("no minuto exato ja comecou",
  aguardandoAgendamento(
    { cargaAgendada: true, agendamentoEm: h("10:00") }, new Date(h("10:00"))), false);

eq("sem agendamento nunca aguarda",
  aguardandoAgendamento({ cargaAgendada: false, agendamentoEm: null }, new Date(h("09:00"))), false);

// Marcada como agendada mas sem horario: nao da para aguardar uma hora
// que nao existe.
eq("agendada sem horario nao aguarda",
  aguardandoAgendamento({ cargaAgendada: true, agendamentoEm: null }, new Date(h("09:00"))), false);

// Enquanto aguarda, o TMA fica em zero (minutosEntre nunca e negativo).
eq("TMA fica zerado enquanto aguarda",
  tmaEmAndamentoMinutos(
    { chegadaEm: h("09:00"), cargaAgendada: true, agendamentoEm: h("10:00") },
    new Date(h("09:30"))), 0);

console.log("\n== A BOLINHA SEGUE O TMA, NAO A CHEGADA ==");
// Chegou 4h antes do agendado. Pela CHEGADA ela ja teria passado do alvo
// e a bolinha ficaria vermelha antes de o TMA comecar.
eq("chegou muito cedo NAO fica vermelha",
  corSinalizador(
    { chegadaEm: h("06:00"), cargaAgendada: true, agendamentoEm: h("10:00") },
    161, new Date(h("09:00"))), "verde");

eq("agendada que estourou fica vermelha",
  corSinalizador(
    { chegadaEm: h("08:00"), cargaAgendada: true, agendamentoEm: h("08:00") },
    161, new Date(h("11:00"))), "vermelho");

eq("sem agendamento e dentro do alvo fica amarela",
  corSinalizador(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null },
    161, new Date(h("09:00"))), "amarelo");

eq("sem agendamento que estourou fica vermelha",
  corSinalizador(
    { chegadaEm: h("08:00"), cargaAgendada: false, agendamentoEm: null },
    161, new Date(h("11:00"))), "vermelho");
console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);

