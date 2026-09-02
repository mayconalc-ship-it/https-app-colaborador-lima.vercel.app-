// Bate palete. O que este teste guarda: cadastro incompleto NUNCA vira
// zero (um item invisivel no total e pior que uma mensagem de erro), e a
// taxa que compara pessoas e a de CAIXAS, nao a de paletes.
//   npx tsx src/lib/__testes__/bate-palete.teste.mjs
import {
  hlRecuperado, pctAvariaDoPalete, resumirBatePalete,
  avariaPorProduto, mediaPaletesPorDia,
} from "../bate-palete.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Produto 13486 do cadastro real: 0,06 HL/caixa, 150 caixas/palete.
const p13486 = { fatorHecto: 0.06, caixasPallet: 150 };
const semFator = { fatorHecto: null, caixasPallet: 150 };
const semPalete = { fatorHecto: 0.06, caixasPallet: null };

console.log("== HL RECUPERADO (o que voltou a ser vendavel) ==");
eq("30 caixas boas repostas", hlRecuperado(30, p13486), 1.8);
eq("nenhuma reposta ainda e zero, nao null", hlRecuperado(0, p13486), 0);
// Sem o fator o item e RECUSADO la na acao: aqui devolve null para a
// acao poder recusar. Entrar valendo zero sumiria do total em silencio.
eq("sem fator no cadastro e null", hlRecuperado(30, semFator), null);
eq("quantidade negativa e null", hlRecuperado(-1, p13486), null);

console.log("\n== QUANTO DO PALETE ESTAVA AVARIADO ==");
eq("15 de 150 caixas = 10%", pctAvariaDoPalete(15, p13486), 10);
eq("palete inteiro perdido", pctAvariaDoPalete(150, p13486), 100);
// Sem saber o tamanho do palete, "12 caixas" nao vira porcentagem de
// nada -- melhor nao mostrar do que inventar.
eq("sem caixas_pallet e null", pctAvariaDoPalete(12, semPalete), null);

console.log("\n== RESUMO DA SESSAO ==");
const T = (h) => `2026-09-03T${h}:00-03:00`;
const itens = [
  { caixasAvariadas: 20, caixasRepostas: 20, hlRecuperado: 1.2 },
  { caixasAvariadas: 10, caixasRepostas: 10, hlRecuperado: 0.6 },
];
const r = resumirBatePalete(T("08:00"), T("10:00"), itens);
eq("paletes batidos", r.paletes, 2);
eq("minutos", r.minutos, 120);
eq("caixas avariadas retiradas", r.caixasAvariadas, 30);
eq("caixas boas repostas", r.caixasRepostas, 30);
// O esforco e proporcional ao que passou pela mao: tirou + repos.
eq("caixas TRATADAS = tirou + repos", r.caixasTratadas, 60);
eq("HL recuperado", r.hlRecuperado, 1.8);
eq("paletes por hora", r.paletesPorHora, 1);
eq("caixas por hora", r.caixasPorHora, 30);
eq("minutos por palete", r.minutosPorPalete, 60);

console.log("\n== SESSAO SEM TEMPO OU SEM ITEM NAO INVENTA TAXA ==");
const vazia = resumirBatePalete(T("08:00"), T("10:00"), []);
eq("sem item nao ha paletes/h", vazia.paletesPorHora, null);
eq("sem item nao ha caixas/h", vazia.caixasPorHora, null);
eq("sem item nao ha min/palete", vazia.minutosPorPalete, null);
// Sessao aberta: o fim e "agora", entao os minutos correm -- mas os
// totais de caixa continuam valendo.
const aberta = resumirBatePalete(new Date().toISOString(), null, itens);
eq("sessao aberta ainda soma as caixas", aberta.caixasTratadas, 60);

console.log("\n== AVARIA POR PRODUTO: onde esta o problema de origem ==");
const porProduto = avariaPorProduto([
  { produtoId: "a", caixasAvariadas: 40, caixasRepostas: 40, hlRecuperado: 2.4 },
  { produtoId: "a", caixasAvariadas: 40, caixasRepostas: 38, hlRecuperado: 2.3 },
  { produtoId: "b", caixasAvariadas: 5, caixasRepostas: 5, hlRecuperado: 0.3 },
]);
eq("ordenado pela avaria", porProduto.map((p) => p.produtoId), ["a", "b"]);
eq("soma os paletes do produto", porProduto[0].paletes, 2);
// 40 caixas quebradas em TODO palete e problema de paletizacao ou
// transporte, nao de armazem -- e so a media por palete mostra isso.
eq("media por palete", porProduto[0].avariaMediaPorPalete, 40);
eq("produto com pouca avaria", porProduto[1].avariaMediaPorPalete, 5);
eq("sem item nenhum", avariaPorProduto([]), []);

console.log("\n== MEDIA POR DIA: domingo parado nao entra ==");
eq("3 dias com movimento, 12 paletes",
  mediaPaletesPorDia([
    { dia: "2026-09-01", paletes: 5 },
    { dia: "2026-09-01", paletes: 1 },
    { dia: "2026-09-02", paletes: 4 },
    { dia: "2026-09-03", paletes: 2 },
  ]),
  4);
eq("sem sessao nenhuma", mediaPaletesPorDia([]), null);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
