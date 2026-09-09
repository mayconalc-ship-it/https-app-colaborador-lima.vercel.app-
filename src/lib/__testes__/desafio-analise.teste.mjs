// As regras de leitura do Desafio. Sao decisoes de OPERACAO -- o que
// conta como chute, o que vira pauta de treinamento, como se soma o
// acerto de um POP -- e por isso valem teste.
//   npx tsx src/lib/__testes__/desafio-analise.teste.mjs
import {
  acertoPorGrupo,
  desempenhoPorQuestao,
  distribuicaoDeAcertos,
  tomDoAcerto,
} from "../desafio-analise.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

const q = (id, extra = {}) => ({
  id,
  pergunta: `P${id}`,
  dificuldade: "media",
  padraoNome: null,
  atividade: null,
  pilar: null,
  ...extra,
});
const r = (questaoId, correta, segundos) => ({ questaoId, correta, tempoMs: segundos * 1000 });

console.log("== QUESTAO SEM RESPOSTA NAO E QUESTAO COM 0% ==");

// Sem este filtro, a questao que ninguem respondeu aparece no TOPO da
// lista de problemas -- sendo o unico item da lista sem problema nenhum.
const semResposta = desempenhoPorQuestao([q(1), q(2)], [r(1, true, 10)]);
eq("so a respondida entra", semResposta.length, 1);
eq("e e a certa", semResposta[0].id, 1);

console.log("\n== PERCENTUAL E TEMPO ==");

const d = desempenhoPorQuestao(
  [q(1)],
  [r(1, true, 10), r(1, false, 20), r(1, true, 30), r(1, true, 20)],
);
eq("tres de quatro", d[0].pctAcerto, 75);
eq("respondida por quatro", d[0].respondida, 4);
eq("tempo medio em segundos", d[0].segundosMedio, 20);

console.log("\n== CHEIRO DE CHUTE ==");

// Errar depois de pensar e falta de conhecimento: treina-se. Errar em
// tres segundos e pressa, e cobrar conteudo de quem so clicou rapido
// treina a coisa errada.
const chute = desempenhoPorQuestao([q(1)], [r(1, false, 3), r(1, false, 2), r(1, true, 3)]);
eq("rapido e errado e chute", chute[0].cheiroDeChute, true);

const pensou = desempenhoPorQuestao([q(1)], [r(1, false, 40), r(1, false, 35), r(1, true, 30)]);
eq("devagar e errado NAO e chute", pensou[0].cheiroDeChute, false);

const rapidoEcerto = desempenhoPorQuestao([q(1)], [r(1, true, 2), r(1, true, 3), r(1, true, 2)]);
eq("rapido e certo e dominio, nao chute", rapidoEcerto[0].cheiroDeChute, false);

console.log("\n== ACERTO DO POP: SOMA SOBRE SOMA ==");

// Uma pergunta respondida por 2 pessoas nao pode pesar o mesmo que uma
// respondida por 30 na nota do POP. Media de percentuais daria 50%
// ((0+100)/2); a conta certa da 1 acerto em 31 respostas = 3%.
const doisPops = desempenhoPorQuestao(
  [q(1, { padraoNome: "POP-A" }), q(2, { padraoNome: "POP-A" })],
  [
    ...Array.from({ length: 30 }, () => r(1, false, 10)),
    r(2, true, 10),
  ],
);
const grupos = acertoPorGrupo(doisPops, (x) => x.origem);
eq("um POP so", grupos.length, 1);
eq("soma sobre soma, nao media de percentuais", grupos[0].pctAcerto, 3);
eq("duas questoes no POP", grupos[0].questoes, 2);

// Sem padrao cadastrado a questao nao some do agrupamento -- ela vai
// para um balde com nome, senao o total do agrupamento nao fecha com o
// total da rodada.
const semPadrao = acertoPorGrupo(desempenhoPorQuestao([q(9)], [r(9, true, 5)]), (x) => x.origem);
eq("sem padrao ganha um balde nomeado", semPadrao[0].chave, "sem padrão de origem");

console.log("\n== A FORMA DA TURMA, NAO SO A MEDIA ==");

// Media 6 nos dois casos, acoes opostas: no primeiro treina-se todo
// mundo, no segundo treina-se metade.
const parelho = distribuicaoDeAcertos([6, 6, 6, 6], 10);
eq("quatro pessoas com 6", parelho[6].pessoas, 4);
eq("ninguem com 10", parelho[10].pessoas, 0);
eq("uma faixa por nota possivel", parelho.length, 11);

const partido = distribuicaoDeAcertos([2, 2, 10, 10], 10);
eq("dois no fundo", partido[2].pessoas, 2);
eq("dois no topo", partido[10].pessoas, 2);

eq("nota fora da escala nao entra", distribuicaoDeAcertos([99], 10).reduce((s, f) => s + f.pessoas, 0), 0);

console.log("\n== A REGUA DA COR ==");
eq("80 e bom", tomDoAcerto(80), "bom");
eq("60 ainda e atencao", tomDoAcerto(60), "atencao");
eq("59 e ruim", tomDoAcerto(59), "ruim");
eq("sem amostra e neutro", tomDoAcerto(null), "neutro");

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
