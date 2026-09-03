// A regra do "Voce sabia?": qual pergunta vira card, e nessa ordem.
// O que este teste guarda e a PRIORIDADE (erro proprio antes de
// estatistica) e as duas travas do nivel 2 -- amostra minima e teto de
// acerto. Sao elas que impedem a lampada de virar ruido.
//   npx tsx src/lib/__testes__/voce-sabia.teste.mjs
import {
  escolherDica,
  pctDeAcerto,
  fraseDoMotivo,
  diaDaOperacao,
  MINIMO_DE_RESPOSTAS,
  TETO_DE_ACERTO,
} from "../voce-sabia.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Atalho: uma candidata com o minimo para o teste ler.
const q = (id, { acertos = 10, erros = 10, euErrei = false } = {}) => ({
  questaoId: id,
  pergunta: `Pergunta ${id}`,
  resposta: `Resposta ${id}`,
  explicacao: "porque sim",
  area: "AL",
  acertos,
  erros,
  euErrei,
});

console.log("== O ERRO DA PESSOA VEM PRIMEIRO ==");
// Ela errou a 1, que o time acerta bastante. A 2 o time erra muito, mas
// ela acertou. O pedido do dono e rever o que ELA errou.
const meuErro = escolherDica(
  [q(1, { acertos: 19, erros: 1, euErrei: true }), q(2, { acertos: 2, erros: 18 })],
  new Set(),
);
eq("escolhe a que ela errou, mesmo com o time acertando", meuErro.questaoId, 1);
eq("e diz por que", meuErro.motivo, "meu_erro");

// Duas dela: a que o time mais erra primeiro.
eq(
  "entre dois erros proprios, o mais errado pelo time",
  escolherDica(
    [q(1, { acertos: 18, erros: 2, euErrei: true }), q(2, { acertos: 4, erros: 16, euErrei: true })],
    new Set(),
  ).questaoId,
  2,
);

console.log("\n== SEM ERRO PROPRIO, CAI PARA A AREA ==");
const daArea = escolherDica([q(1, { acertos: 5, erros: 15 }), q(2, { acertos: 12, erros: 8 })], new Set());
eq("pega a mais errada da area", daArea.questaoId, 1);
eq("e diz por que", daArea.motivo, "area_erra");
eq("com o percentual junto", daArea.pctAcerto, 25);

console.log("\n== AS DUAS TRAVAS DO NIVEL 2 ==");
// Amostra pequena nao vira card: "0% de acerto" em 4 respostas e ruido,
// nao ponto fraco do time. Foi o caso real do Armazem em 03/09/2026.
eq(
  `abaixo de ${MINIMO_DE_RESPOSTAS} respostas nao aparece`,
  escolherDica([q(1, { acertos: 0, erros: 4 })], new Set()),
  null,
);
eq(
  "com a amostra completa, aparece",
  escolherDica([q(1, { acertos: 0, erros: 5 })], new Set()).questaoId,
  1,
);
// Teto: o que quase todo mundo acerta nao ensina ninguem.
eq(
  `acima de ${TETO_DE_ACERTO}% nao aparece`,
  escolherDica([q(1, { acertos: 18, erros: 2 })], new Set()),
  null,
);
// Mas o erro PROPRIO ignora as duas travas -- e o certo: ela errou.
eq(
  "erro proprio passa mesmo com 90% de acerto do time",
  escolherDica([q(1, { acertos: 18, erros: 2, euErrei: true })], new Set()).questaoId,
  1,
);
eq(
  "erro proprio passa mesmo com amostra minuscula",
  escolherDica([q(1, { acertos: 0, erros: 1, euErrei: true })], new Set()).questaoId,
  1,
);

console.log("\n== NAO REPETE, E APAGA QUANDO ACABA ==");
// O coracao da funcionalidade: card visto nao volta.
eq(
  "o que ja foi visto nao volta",
  escolherDica([q(1, { euErrei: true }), q(2, { acertos: 3, erros: 17 })], new Set([1])).questaoId,
  2,
);
eq(
  "vistas todas, a lampada apaga",
  escolherDica([q(1, { euErrei: true }), q(2, { acertos: 3, erros: 17 })], new Set([1, 2])),
  null,
);
eq("acervo vazio nao quebra", escolherDica([], new Set()), null);

console.log("\n== PERCENTUAL ==");
eq("sem amostra, nao afirma percentual", pctDeAcerto(2, 2), null);
eq("com amostra, arredonda", pctDeAcerto(4, 2), 67);
eq("tudo certo e 100", pctDeAcerto(10, 0), 100);

console.log("\n== A FRASE DA TELA ==");
eq(
  "erro proprio fala com a pessoa",
  fraseDoMotivo({ motivo: "meu_erro", pctAcerto: 30 }, "Armazém"),
  "Você errou esta no desafio",
);
eq(
  "estatistica cita a area",
  fraseDoMotivo({ motivo: "area_erra", pctAcerto: 30 }, "Armazém"),
  "Só 30% acertaram esta em Armazém",
);

console.log("\n== O DIA E O DA OPERACAO, NAO O DO SERVIDOR ==");
// 23h30 de 03/09 em UTC ainda e dia 03 aqui (UTC-3, 20h30). Sem o fuso, a
// lampada de quem abre o app no fim do turno acenderia duas vezes.
eq("23h UTC ainda e o mesmo dia daqui", diaDaOperacao(new Date("2026-09-03T23:30:00Z")), "2026-09-03");
// 02h de 04/09 em UTC ainda e 03/09 as 23h aqui.
eq("2h UTC ainda e o dia anterior daqui", diaDaOperacao(new Date("2026-09-04T02:00:00Z")), "2026-09-03");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
