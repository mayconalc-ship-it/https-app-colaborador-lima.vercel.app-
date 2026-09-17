// Confere as regras do Resumo Semanal e da Limpeza de Acessos:
//   npx tsx src/lib/__testes__/resumo-e-limpeza.teste.mjs
import {
  agoraEmSP,
  chaveDoResumo,
  ehHoraDoResumo,
  frasesDasPendencias,
  rotuloDaSemana,
  segundaDaSemana,
  semanaAnterior,
  semanaQueComecaEm,
} from "../resumo-semanal.ts";
import { haQuantoTempo, liberacoesSemUso, telaCasa, ultimoAcesso, ultimoUsoDoModulo } from "../limpeza-de-acessos.ts";
import {
  chaveDoLembreteDeContagem,
  deveAvisarCompra,
  deveLembrarContagem,
  horaSP,
  inicioDoDiaSP,
  validarHoraDoLembrete,
} from "../material-apoio.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) falhas++;
  console.log(`  ${a === b ? "OK " : "FALHOU"}  ${nome}${a === b ? "" : `: obtido ${a}, esperado ${b}`}`);
}

console.log("== SEMANA ==");
eq("segunda de uma quarta", segundaDaSemana("2026-09-16"), "2026-09-14");
eq("segunda de um domingo é a de antes", segundaDaSemana("2026-09-20"), "2026-09-14");
eq("segunda de uma segunda é ela mesma", segundaDaSemana("2026-09-21"), "2026-09-21");
eq("semana anterior numa segunda", semanaAnterior("2026-09-21"), { inicio: "2026-09-14", fim: "2026-09-20" });
eq("semana anterior numa quarta", semanaAnterior("2026-09-16"), { inicio: "2026-09-07", fim: "2026-09-13" });
eq("virada de mês", semanaAnterior("2026-10-05"), { inicio: "2026-09-28", fim: "2026-10-04" });
eq("rótulo", rotuloDaSemana({ inicio: "2026-09-07", fim: "2026-09-13" }), "07/09 a 13/09");
eq("semana pedida válida", semanaQueComecaEm("2026-09-07"), { inicio: "2026-09-07", fim: "2026-09-13" });
eq("dia que não é segunda", semanaQueComecaEm("2026-09-08"), null);
eq("lixo", semanaQueComecaEm("abc"), null);
eq("chave por revenda e semana", chaveDoResumo("r1", { inicio: "2026-09-14", fim: "2026-09-20" }), "resumo-semanal:r1:2026-09-14");

console.log("\n== HORA DO RESUMO (fuso de São Paulo, servidor em UTC) ==");
// Segunda 21/09/2026 às 06:59 em SP = 09:59 UTC.
eq("segunda 6h59 ainda não", ehHoraDoResumo(new Date("2026-09-21T09:59:00Z")), false);
eq("segunda 7h00 sim", ehHoraDoResumo(new Date("2026-09-21T10:00:00Z")), true);
eq("segunda 23h em SP (terça em UTC) ainda é segunda", ehHoraDoResumo(new Date("2026-09-22T02:30:00Z")), true);
eq("domingo 22h em SP (segunda 01h UTC) não", ehHoraDoResumo(new Date("2026-09-21T01:00:00Z")), false);
eq("dia em SP às 22h de domingo", agoraEmSP(new Date("2026-09-21T01:00:00Z")).dia, "2026-09-20");

console.log("\n== FRASES ==");
eq("só o que existe", frasesDasPendencias({ praticasEmAnalise: 5, materiaisAbaixoDaMinima: 0, tratativasPendentes: null, recontagensAbertas: 1 }), [
  "5 boas práticas para avaliar",
  "1 recontagem de AG aberta",
]);

console.log("\n== LIMPEZA ==");
eq("tela casa com subtela", telaCasa("/fefo/controle", "/fefo"), true);
eq("tela não casa com prefixo parecido", telaCasa("/fefox", "/fefo"), false);
const usos = [
  { colaboradorId: "a", tela: "/produtividade-armazem/empilhadeira", ultimoEm: "2026-09-10T10:00:00Z" },
  { colaboradorId: "a", tela: "/", ultimoEm: "2026-09-15T10:00:00Z" },
  { colaboradorId: "a", tela: "/produtividade-armazem/picking", ultimoEm: "2026-07-01T10:00:00Z" },
];
eq("último uso do módulo", ultimoUsoDoModulo(usos, "pa-empilhadeira"), "2026-09-10T10:00:00Z");
eq("picking pela tela antiga", ultimoUsoDoModulo(usos, "pa-picking"), "2026-07-01T10:00:00Z");
eq("último acesso ao app", ultimoAcesso(usos), "2026-09-15T10:00:00Z");
const corte = "2026-08-17T00:00:00Z";
const libs = [
  { colaboradorId: "a", modulo: "pa-empilhadeira", liberadoEm: "2026-08-01T00:00:00Z" }, // usou: fica
  { colaboradorId: "a", modulo: "pa-picking", liberadoEm: "2026-06-01T00:00:00Z" }, // parou em julho: sai
  { colaboradorId: "a", modulo: "pa-despejo", liberadoEm: "2026-09-10T00:00:00Z" }, // liberado há pouco: fica
  { colaboradorId: "a", modulo: "comunicados", liberadoEm: "2026-01-01T00:00:00Z" }, // leitura: não confere
  { colaboradorId: "b", modulo: "rv", liberadoEm: "2026-01-01T00:00:00Z" }, // nunca abriu: sai
];
eq(
  "sem uso",
  liberacoesSemUso(libs, new Map([["a", usos]]), corte).map((l) => [l.colaboradorId, l.modulo, l.ultimoUsoEm]),
  [
    ["a", "pa-picking", "2026-07-01T10:00:00Z"],
    ["b", "rv", null],
  ],
);
eq("nunca", haQuantoTempo(null), "nunca");
eq("há 45 dias", haQuantoTempo("2026-08-01T12:00:00Z", new Date("2026-09-15T13:00:00Z")), "há 45 dias");

console.log("\n== LEMBRETE DA CONTAGEM DO MATERIAL DE APOIO ==");
eq("hora 14 aceita", validarHoraDoLembrete("14"), { hora: 14 });
eq("hora 3 recusada", "erro" in validarHoraDoLembrete("3"), true);
eq("hora quebrada recusada", "erro" in validarHoraDoLembrete("14.5"), true);
eq("vazio recusado", "erro" in validarHoraDoLembrete(""), true);
eq("antes da hora não lembra", deveLembrarContagem({ ativo: true, hora: 14, horaAgora: 13, contouHoje: false }), false);
eq("na hora, sem contagem, lembra", deveLembrarContagem({ ativo: true, hora: 14, horaAgora: 14, contouHoje: false }), true);
eq("já contou hoje não lembra", deveLembrarContagem({ ativo: true, hora: 14, horaAgora: 18, contouHoje: true }), false);
eq("desligado não lembra", deveLembrarContagem({ ativo: false, hora: 14, horaAgora: 18, contouHoje: false }), false);
// 22h de 16/09 em SP = 01h de 17/09 em UTC: a hora e o dia são os de SP.
eq("hora em SP com servidor em UTC", horaSP(new Date("2026-09-17T01:00:00Z")), 22);
eq("começo do dia em SP", inicioDoDiaSP(new Date("2026-09-17T01:00:00Z")), "2026-09-16T00:00:00-03:00");
console.log("\n== ALERTA DE COMPRA: UMA VEZ POR SITUAÇÃO ==");
const agora17 = new Date("2026-09-17T09:00:00Z");
const base = { ultimoEm: "2026-09-16T16:35:00Z", teveEntradaDesde: false, agora: agora17 };
eq("nunca avisou: avisa", deveAvisarCompra({ nivelAtual: "abaixo-minima", ultimoNivel: null, ultimoEm: null, teveEntradaDesde: false }), true);
eq("contou de novo, mesma faixa, ontem: não avisa", deveAvisarCompra({ ...base, nivelAtual: "abaixo-minima", ultimoNivel: "abaixo-minima" }), false);
eq("perto depois de abaixo: não avisa", deveAvisarCompra({ ...base, nivelAtual: "perto-minima", ultimoNivel: "abaixo-minima" }), false);
eq("piorou de perto para abaixo: avisa", deveAvisarCompra({ ...base, nivelAtual: "abaixo-minima", ultimoNivel: "perto-minima" }), true);
eq("entrou material e continua abaixo: avisa", deveAvisarCompra({ ...base, nivelAtual: "abaixo-minima", ultimoNivel: "abaixo-minima", teveEntradaDesde: true }), true);
eq("7 dias parado: repete", deveAvisarCompra({ ...base, nivelAtual: "abaixo-minima", ultimoNivel: "abaixo-minima", agora: new Date("2026-09-23T17:00:00Z") }), true);

eq("chave por dia", chaveDoLembreteDeContagem("r1", "2026-09-16"), "material-apoio-contagem:r1:2026-09-16");

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
