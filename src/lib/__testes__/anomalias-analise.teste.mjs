// A análise do painel de anomalias.
//   npx tsx src/lib/__testes__/anomalias-analise.teste.mjs
import { analisar, segundaDe } from "../anomalias-analise.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
const HOJE = "2026-10-03"; // sábado
const r = (dia, status = "aberto", extra = {}) => ({
  indicadorRotulo: "TMA",
  dia,
  status,
  abertoEm: `${dia}T13:00:00Z`,
  assinadoEm: null,
  atendimentoId: null,
  ...extra,
});

console.log("== SEMANAS ==");
ok("segunda de um sábado", segundaDe("2026-10-03") === "2026-09-28");
ok("segunda de uma segunda", segundaDe("2026-09-28") === "2026-09-28");
ok("segunda de um domingo", segundaDe("2026-10-04") === "2026-09-28");
const a = analisar([r("2026-09-28"), r("2026-10-03"), r("2026-09-27"), r("2026-08-01")], [], [], new Map(), HOJE);
ok("8 semanas, a última é a atual", a.semanas.length === 8 && a.semanas[7].inicio === "2026-09-28");
ok("semana atual conta 2", a.semanas[7].total === 2);
ok("semana anterior conta 1", a.semanas[6].total === 1);
ok("rótulo dd/mm", a.semanas[7].rotulo === "28/09");
ok("fora das 8 semanas não entra", a.semanas.reduce((t, s) => t + s.total, 0) === 3);

console.log("== 30 x 30 ==");
const t = analisar([r("2026-10-03"), r("2026-09-04"), r("2026-09-03"), r("2026-08-05"), r("2026-08-04")], [], [], new Map(), HOJE);
ok("últimos 30 dias (04/09 a 03/10)", t.ultimos30 === 2, String(t.ultimos30));
ok("30 anteriores (05/08 a 03/09)", t.anteriores30 === 2, String(t.anteriores30));

console.log("== RAPIDEZ E PLANO ==");
const p = analisar(
  [
    r("2026-09-20", "concluido", { abertoEm: "2026-09-20T12:00:00Z", assinadoEm: "2026-09-22T12:00:00Z" }),
    r("2026-09-25", "concluido", { abertoEm: "2026-09-25T12:00:00Z", assinadoEm: "2026-09-29T12:00:00Z" }),
  ],
  [
    { status: "pendente", prazo: "2026-10-10" },
    { status: "pendente", prazo: "2026-10-01" },
    { status: "pendente", prazo: null },
    { status: "concluida", prazo: "2026-09-01" },
  ],
  [],
  new Map(),
  HOJE,
);
ok("média de 3 dias até assinar", p.diasAteAssinar === 3, String(p.diasAteAssinar));
ok("2 de 3 ações abertas no prazo = 67%", p.pctAcoesNoPrazo === 67 && p.acoesAbertas === 3);
ok("sem assinado: null", analisar([r("2026-10-01")], [], [], new Map(), HOJE).diasAteAssinar === null);
ok("sem ação aberta: null", analisar([], [{ status: "concluida", prazo: null }], [], new Map(), HOJE).pctAcoesNoPrazo === null);

console.log("== CICLO E RANKINGS ==");
const c = analisar(
  [
    r("2026-10-01", "aberto"),
    r("2026-10-01", "em_analise", { indicadorRotulo: "% de avaria" }),
    r("2026-10-02", "plano_definido", { atendimentoId: "a1" }),
    r("2026-10-02", "concluido", { atendimentoId: "a1" }),
    r("2026-06-01", "eficacia_verificada", { atendimentoId: "a1" }),
  ],
  [],
  [
    { atendimentoId: "a1", criadoEm: "2026-09-30T10:00:00Z" },
    { atendimentoId: "a2", criadoEm: "2026-09-30T10:00:00Z" },
    { atendimentoId: "a3", criadoEm: "2026-09-30T10:00:00Z" },
  ],
  new Map([["a1", "PCN-0509"], ["a2", "ABC-1D23"]]),
  HOJE,
);
ok("ciclo na ordem, com cada etapa", c.ciclo.map((e) => e.valor).join() === "1,1,1,1,1");
ok("indicador que mais dispara primeiro (90 dias)", c.indicadores[0].rotulo === "TMA" && c.indicadores[0].valor === 3);
ok("placa: 2 relatos + 1 blitz (o de junho fica de fora)", c.placas[0].rotulo === "PCN-0509" && c.placas[0].valor === 3 && c.placas[0].nota === "2 relatos · 1 blitz", JSON.stringify(c.placas[0]));
ok("atendimento sem placa não entra", c.placas.length === 2);

console.log("== TERMÔMETRO ==");
const ruim = analisar([r("2026-09-30", "aberto", { abertoEm: "2026-09-30T13:00:00Z" })], [{ status: "pendente", prazo: "2026-10-01" }], [], new Map(), HOJE);
ok("relato sem dono + ação vencida = vermelho", ruim.termometro.tom === "ruim");
ok("diz quantos e há quantos dias", ruim.termometro.detalhe.startsWith("1 relato sem ninguém (o mais antigo há 3 dias) e 1 ação atrasada"), ruim.termometro.detalhe);
const andando = analisar([r("2026-09-30", "em_analise")], [{ status: "pendente", prazo: "2026-10-30" }], [], new Map(), HOJE);
ok("só em tratativa e no prazo = amarelo", andando.termometro.tom === "atencao");
ok("nada aberto = verde", analisar([r("2026-09-30", "concluido")], [], [], new Map(), HOJE).termometro.tom === "bom");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
