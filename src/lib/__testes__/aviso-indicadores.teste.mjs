// O aviso depois de importar um indicador. O que se guarda aqui e o
// TOM e a CONTAGEM: um aviso que cobra faz a pessoa escrever o minimo
// para se livrar, e um aviso que chega para quem nao tem nada pendente
// ensina a ignorar o proximo.
//   npx tsx src/lib/__testes__/aviso-indicadores.teste.mjs
import {
  textoDoAviso, contarPendenciasPorPessoa, podeAvisar,
  ROTA_DO_INDICADOR, HORAS_ENTRE_AVISOS,
} from "../aviso-indicadores.ts";

let falhas = 0;
function ok(nome, cond, det = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${det ? ": " + det : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("== CONTAGEM POR PESSOA ==");
// Uma avaliacao tem motorista E ajudante: os dois precisam poder explicar.
eq("a mesma pendencia conta para os dois",
  [...contarPendenciasPorPessoa([{ id: "a1", pessoas: ["motorista", "ajudante"] }])].sort(),
  [["ajudante", 1], ["motorista", 1]]);

// A MESMA pessoa aparecendo duas vezes na linha (motorista e conferente
// do proprio mapa) nao pode virar duas pendencias.
eq("pessoa repetida na linha conta uma vez",
  [...contarPendenciasPorPessoa([{ id: "a1", pessoas: ["joao", "joao", null] }])],
  [["joao", 1]]);

eq("pendencias diferentes somam",
  [...contarPendenciasPorPessoa([
    { id: "a1", pessoas: ["joao"] },
    { id: "a2", pessoas: ["joao"] },
    { id: "a3", pessoas: ["maria"] },
  ])].sort(),
  [["joao", 2], ["maria", 1]]);

// Linha sem dono nao gera aviso para ninguem.
eq("linha sem pessoa nao entra", [...contarPendenciasPorPessoa([{ id: "a1", pessoas: [null, null] }])], []);
eq("lista vazia", [...contarPendenciasPorPessoa([])], []);

console.log("\n== O TEXTO CONVIDA, NAO COBRA ==");
for (const ind of ["rating", "refugo", "devolucao"]) {
  const um = textoDoAviso(ind, 1);
  const varios = textoDoAviso(ind, 4);
  ok(`${ind}: singular sem "1 " no plural`, !um.mensagem.includes("1 entregas") && !um.mensagem.includes("1 dias"));
  ok(`${ind}: plural cita o numero`, varios.titulo.includes("4") || varios.mensagem.includes("4"));
  ok(`${ind}: titulo e mensagem existem`, um.titulo.length > 8 && um.mensagem.length > 40);
  // Nenhuma palavra de punicao: o texto tem que soar convite.
  // Sem acento na comparacao -- as frases do app tem acento, e o teste
  // que as procura precisa achar "nao e" dentro de "nao e".
  const texto = (um.titulo + " " + um.mensagem)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  ok(`${ind}: sem tom de advertencia`,
    !/advert|puni|penalid|desconto|cobran/.test(texto));
  // A frase que tira o peso de cima da pessoa precisa estar la.
  ok(`${ind}: diz que boa parte nao e dela`,
    /nao e de quem entrega|nao sao falha|nao e falha|parecendo culpa/.test(texto));
}
ok("toda rota comeca com barra", Object.values(ROTA_DO_INDICADOR).every((r) => r.startsWith("/")));

console.log("\n== NAO REPETIR O AVISO ==");
const base = new Date("2026-09-02T12:00:00Z");
const atras = (h) => new Date(base.getTime() - h * 3600000).toISOString();
ok("primeira vez sempre avisa", podeAvisar(null, base));
// Reimportar no mesmo dia (corrigir a pasta, refazer um mes) e comum.
ok("reimportacao logo depois NAO avisa de novo", !podeAvisar(atras(2), base));
ok(`${HORAS_ENTRE_AVISOS} h depois avisa`, podeAvisar(atras(HORAS_ENTRE_AVISOS), base));
ok("no dia seguinte avisa", podeAvisar(atras(25), base));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
