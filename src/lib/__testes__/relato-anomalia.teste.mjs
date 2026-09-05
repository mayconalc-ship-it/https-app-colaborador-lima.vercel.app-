// O que impede um relato de anomalia de fechar.
//   npx tsx src/lib/__testes__/relato-anomalia.teste.mjs
//
// A checagem existe para o RA nao virar papel preenchido pela metade. O
// auditor nao pergunta se o formulario foi aberto -- ele pergunta qual
// era a causa raiz, quem ficou com a acao e ate quando. Cada pendencia
// aqui e uma dessas perguntas.
import {
  pendenciasDoRelato,
  podeFechar,
  tituloDoRelato,
  PERGUNTAS_PADRONIZACAO,
  PORQUES,
} from "../relato-anomalia.ts";

let falhas = 0;
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}
function eq(nome, obtido, esperado) {
  const igual = obtido === esperado;
  if (!igual) falhas++;
  console.log(`  ${igual ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

const todasPadronizacao = Object.fromEntries(PERGUNTAS_PADRONIZACAO.map((p) => [p.id, "sim"]));
const acaoBoa = {
  topico: "causa_raiz",
  oQue: "Criar bloqueio no sistema",
  como: "Parametrizar o SAP",
  quem: "RENATA PACHECO",
  prazo: "2026-09-15",
  status: "pendente",
};
const completo = {
  porques: ["a", "b", "c", "d", "e"],
  padronizacao: todasPadronizacao,
  acoes: [acaoBoa],
  assinaturaGestor: "LEONARDO BOLDIN",
};

console.log("== O RELATO COMPLETO FECHA ==");
eq("sem pendencia", pendenciasDoRelato(completo).length, 0);
ok("pode fechar", podeFechar(completo));

console.log("\n== OS 5 PORQUES ==");
const tresPorques = { ...completo, porques: ["a", "b", "c", null, ""] };
ok("com 3 de 5, nao fecha", !podeFechar(tresPorques));
ok(
  "e diz quantos faltam",
  pendenciasDoRelato(tresPorques)[0].includes(`3 de ${PORQUES}`),
);
// Espaco em branco nao conta como resposta -- e o jeito mais facil de
// "preencher" um formulario sem responder nada.
ok("so espaco nao conta", !podeFechar({ ...completo, porques: ["a", "b", "c", "d", "   "] }));

console.log("\n== A PADRONIZACAO ==");
const semUma = { ...completo, padronizacao: { ...todasPadronizacao, cronica: undefined } };
ok("faltando uma, nao fecha", !podeFechar(semUma));
ok("conta quantas faltam", pendenciasDoRelato(semUma).some((f) => f.includes("1 de 8")));
// "Nao" e resposta; ausencia nao e. Um RA com tudo "Nao" por omissao
// mente para quem le.
const todasNao = Object.fromEntries(PERGUNTAS_PADRONIZACAO.map((p) => [p.id, "nao"]));
ok("responder tudo 'nao' fecha", podeFechar({ ...completo, padronizacao: todasNao }));

console.log("\n== O PLANO DE ACAO ==");
ok("sem acao nenhuma, nao fecha", !podeFechar({ ...completo, acoes: [] }));
ok(
  "acao sem responsavel, nao fecha",
  !podeFechar({ ...completo, acoes: [{ ...acaoBoa, quem: "  " }] }),
);
ok(
  "acao sem prazo, nao fecha",
  !podeFechar({ ...completo, acoes: [{ ...acaoBoa, prazo: null }] }),
);
// O achado classico: plano so com acao corretiva. Apaga o incendio e
// garante o proximo.
const soCorretiva = { ...completo, acoes: [{ ...acaoBoa, topico: "corretiva" }] };
ok("plano sem causa raiz, nao fecha", !podeFechar(soCorretiva));
ok(
  "e explica por que",
  pendenciasDoRelato(soCorretiva).some((f) => f.includes("causa raiz")),
);
ok(
  "corretiva + causa raiz fecha",
  podeFechar({ ...completo, acoes: [{ ...acaoBoa, topico: "corretiva" }, acaoBoa] }),
);

console.log("\n== A ASSINATURA DO GESTOR ==");
ok("sem assinatura, nao fecha", !podeFechar({ ...completo, assinaturaGestor: null }));
ok("so espaco nao vale", !podeFechar({ ...completo, assinaturaGestor: "   " }));

console.log("\n== A LISTA DE PENDENCIAS DIZ TUDO DE UMA VEZ ==");
// Numa folha de trinta campos, "esta invalido" manda a pessoa cacar.
const vazio = { porques: [], padronizacao: {}, acoes: [], assinaturaGestor: null };
const faltas = pendenciasDoRelato(vazio);
ok(`lista as 4 frentes (obtido ${faltas.length})`, faltas.length === 4);
console.log("     " + faltas.join("\n     "));

console.log("\n== O TITULO ==");
eq(
  "comeca pelo indicador, data em pt-BR",
  tituloDoRelato("% de avaria", "2026-09-04"),
  "Relato de Anomalia — % de avaria — 04/09/2026",
);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
