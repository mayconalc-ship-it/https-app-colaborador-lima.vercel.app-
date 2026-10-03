// Confere o Check Global de Manutenção contra a PLANILHA da Ambev
// ("09_Set Checklist Global de Manutenção", Barreiras): a nota que o app
// calcula tem de ser a mesma de cada seção e do total, em T1 a T4.
//   npx tsx src/lib/__testes__/manutencao.teste.mjs
import { readFileSync } from "node:fs";
import {
  calcularNotas, separarCriterios, problemaDaResposta, trimestreDe, rotuloTrimestre,
  mesesDoTrimestre, prazoSugerido, formatarPct, tomDaNota, trimestresSemAvaliacao,
} from "../manutencao.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
const perto = (a, b) => a !== null && Math.abs(a - b) < 1e-9;

const { itens: brutos, alvos } = JSON.parse(
  readFileSync(new URL("./dados/checklist-manutencao-barreiras.json", import.meta.url), "utf8"),
);
const itens = brutos.map((i) => ({ ...i, id: i.numero, critico: i.secao === 1 }));

console.log("== NOTAS IGUAIS À PLANILHA ==");
ok("36 itens em 9 seções", itens.length === 36 && new Set(itens.map((i) => i.secao)).size === 9);
for (let t = 0; t < 4; t++) {
  const respostas = itens.map((i) => ({
    itemId: i.id,
    na: i.t[t] === "N/A",
    nota: typeof i.t[t] === "number" ? i.t[t] : null,
  }));
  const r = calcularNotas(itens, respostas);
  const erradas = r.secoes.filter((s) => !perto(s.pct, alvos["s" + s.secao][t])).map((s) => `${s.secao}: ${s.pct} x ${alvos["s" + s.secao][t]}`);
  ok(`T${t + 1}: as 9 seções batem`, erradas.length === 0, erradas.join("; "));
  ok(`T${t + 1}: total bate (${formatarPct(r.total)})`, perto(r.total, alvos.total[t]), `${r.total} x ${alvos.total[t]}`);
}

console.log("== N/A E ITEM SEM RESPOSTA ==");
const s7 = itens.filter((i) => i.secao === 7);
const so73 = calcularNotas(s7, s7.map((i) => ({ itemId: i.id, nota: 3, na: i.numero === "7.4" })));
ok("N/A sai da conta (7.4 N/A, o resto 3 = 100%)", perto(so73.secoes[0].pct, 1));
const parcial = calcularNotas(itens, [{ itemId: "1.2", nota: 3, na: false }]);
ok("seção sem resposta fica nula, fora da média", parcial.secoes.filter((s) => s.pct === null).length === 8 && perto(parcial.total, 1));
ok("nada respondido = total nulo", calcularNotas(itens, []).total === null);

console.log("== CRITÉRIOS ==");
const c11 = separarCriterios(itens.find((i) => i.numero === "1.1").criterios);
ok("1.1 separa 3, 1 e 0", !!c11[3] && !!c11[1] && !!c11[0], JSON.stringify(c11).slice(0, 160));
ok("frase do 3 não carrega o 1", !c11[3].includes("Algumas anomalias"));
const todos = itens.map((i) => [i.numero, separarCriterios(i.criterios)]);
const semTres = todos.filter(([, c]) => !c[3] || !c[0]).map(([n]) => n);
ok("todo item tem frase para 3 e para 0", semTres.length === 0, semTres.join(", "));
ok("travessão (0 – ...) também separa", !!separarCriterios("3 - Bom. 1 - Médio. 0 – Ruim.")[0]);

console.log("== TRIMESTRE ==");
ok("outubro é T4", rotuloTrimestre(trimestreDe("2026-10-02")) === "T4/2026");
ok("março é T1", trimestreDe("2026-03-31").trimestre === 1);
ok("abril é T2", trimestreDe("2026-04-01").trimestre === 2);
ok("meses do T3", mesesDoTrimestre({ ano: 2026, trimestre: 3 }) === "jul a set");
const hojeT4 = { ano: 2026, trimestre: 4 };
const buracos = trimestresSemAvaliacao([{ ano: 2026, trimestre: 1 }, { ano: 2026, trimestre: 3 }], hojeT4).map(rotuloTrimestre);
ok("acha o trimestre que ficou sem avaliação", JSON.stringify(buracos) === '["T2/2026"]', JSON.stringify(buracos));
ok("o trimestre de hoje ainda está no prazo", trimestresSemAvaliacao([{ ano: 2026, trimestre: 3 }], hojeT4).length === 0);
ok("virada de ano", JSON.stringify(trimestresSemAvaliacao([{ ano: 2025, trimestre: 4 }], { ano: 2026, trimestre: 2 }).map(rotuloTrimestre)) === '["T1/2026"]');
ok("sem avaliação nenhuma, sem alerta", trimestresSemAvaliacao([], hojeT4).length === 0);

console.log("== VALIDAÇÃO ==");
const base = { nota: 3, na: false, planoAcao: "", responsavel: "", prazo: "" };
ok("nota 3 não pede plano", problemaDaResposta(base) === null);
ok("N/A não pede plano", problemaDaResposta({ ...base, nota: null, na: true }) === null);
ok("sem nota nem N/A é erro", problemaDaResposta({ ...base, nota: null }) !== null);
ok("nota 1 sem plano é erro", problemaDaResposta({ ...base, nota: 1 }) !== null);
ok("nota 0 sem prazo é erro", problemaDaResposta({ ...base, nota: 0, planoAcao: "Trocar telha", responsavel: "Zé" }) !== null);
ok("nota 0 com plano completo passa", problemaDaResposta({ ...base, nota: 0, planoAcao: "Trocar telha", responsavel: "Zé", prazo: "2026-11-01" }) === null);
ok("prazo crítico em 30 dias", prazoSugerido("2026-10-02", true) === "2026-11-01");
ok("prazo comum em 90 dias", prazoSugerido("2026-10-02", false) === "2026-12-31");
ok("cores da nota", tomDaNota(0.93) === "bom" && tomDaNota(0.75) === "atencao" && tomDaNota(0.5) === "ruim" && tomDaNota(null) === "neutro");

console.log("== HISTÓRICO 2025 IMPORTADO (migration 158) ==");
const sql = readFileSync(new URL("../../../supabase/migrations/158_historico_manutencao_barreiras_2025.sql", import.meta.url), "utf8");
const doSql = [...sql.matchAll(/^\s+\((\d), '(\d+\.\d+)', (null|\d), (true|false), /gm)].map((m) => ({
  t: Number(m[1]) - 1, numero: m[2], nota: m[3] === "null" ? null : Number(m[3]), na: m[4] === "true",
}));
ok("144 respostas (36 itens x 4)", doSql.length === 144);
const divergentes = doSql.filter((r) => {
  const v = itens.find((i) => i.numero === r.numero)?.t[r.t];
  return r.na ? v !== "N/A" : v !== r.nota;
});
ok("cada nota igual à da planilha", divergentes.length === 0, divergentes.slice(0, 3).map((r) => `${r.numero} T${r.t + 1}`).join(", "));
for (let t = 0; t < 4; t++) {
  const r = calcularNotas(itens, doSql.filter((x) => x.t === t).map((x) => ({ itemId: x.numero, nota: x.nota, na: x.na })));
  ok(`2025 T${t + 1}: o app recalcula ${formatarPct(r.total)}`, perto(r.total, alvos.total[t]));
}

console.log("== 2025 COM O 7.4 COMO N/A (migration 160) ==");
const sql160 = readFileSync(new URL("../../../supabase/migrations/160_manutencao_74_na_2025.sql", import.meta.url), "utf8");
const totais160 = Object.fromEntries([...sql160.matchAll(/\((\d), (0\.\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]));
for (let t = 0; t < 4; t++) {
  const r = calcularNotas(
    itens,
    itens.map((i) => {
      const v = i.numero === "7.4" ? "N/A" : i.t[t];
      return { itemId: i.id, na: v === "N/A", nota: typeof v === "number" ? v : null };
    }),
  );
  ok(`2025 T${t + 1}: a 160 grava ${formatarPct(r.total)}`, Math.abs(r.total - totais160[t + 1]) < 0.000005, `${r.total} x ${totais160[t + 1]}`);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
