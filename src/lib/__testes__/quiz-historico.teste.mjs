// Confere o histórico de padrões do Desafio do Mês: quais já foram tema
// em cada área, para quem cria o próximo não repetir sem perceber.
//   npx tsx src/lib/__testes__/quiz-historico.teste.mjs
import { usosDoPadrao, quandoFoiUsado, mesAno } from "../quiz.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

const r = (rodadaId, area, mes, temporada, padraoId, padraoNome) => ({
  rodadaId,
  nome: `Desafio ${rodadaId}`,
  area,
  mes,
  temporada,
  status: "encerrada",
  padraoId,
  padraoNome,
});

const usos = [
  r(1, "AL", 8, 2026, 10, "Operação de Empilhadeira"),
  r(2, "DU", 8, 2026, 20, "Carregamento"),
  r(3, "AL", 5, 2026, 10, "Operação de Empilhadeira"),
  // O arquivo foi substituído no acervo: id novo, mesmo nome.
  r(4, "AL", 2, 2026, 99, "Operação de empilhadeira "),
  r(5, "AL", 9, 2026, null, null),
];
const empilhadeira = { id: 10, nome: "Operação de Empilhadeira" };

console.log("== USOS ==");
eq("mês curto", mesAno(9, 2026), "Set/2026");
eq(
  "usos no Armazém, do mais novo ao mais antigo (casa por id e por nome)",
  usosDoPadrao(usos, empilhadeira, "AL").map((u) => u.rodadaId),
  [1, 3, 4],
);
eq("o mesmo padrão não conta na outra área", usosDoPadrao(usos, empilhadeira, "DU").length, 0);
eq(
  "a própria rodada não conta como uso",
  usosDoPadrao(usos, empilhadeira, "AL", 1).map((u) => u.rodadaId),
  [3, 4],
);
eq("rodada sem padrão não casa com nada", usosDoPadrao(usos, { id: 0, nome: "" }, "AL").length, 0);
eq("padrão nunca usado", usosDoPadrao(usos, { id: 30, nome: "FEFO" }, "AL").length, 0);

console.log("== RÓTULO ==");
eq("quando foi usado", quandoFoiUsado(usosDoPadrao(usos, empilhadeira, "AL")), "Ago/2026, Mai/2026, Fev/2026");
eq("nunca usado = null", quandoFoiUsado([]), null);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
