// CSV. O erro classico aqui nao da mensagem: o arquivo baixa, o Excel
// abre, e tudo cai na coluna A -- ou "Producao" vira "ProduÃ§Ã£o". Por
// isso o teste guarda o separador, o BOM e a virgula decimal.
//   npx tsx src/lib/__testes__/csv.teste.mjs
import { montarCsv, numeroCsv, nomeDoArquivo } from "../csv.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}

console.log("== O QUE FAZ O EXCEL PT-BR ABRIR CERTO ==");
const csv = montarCsv(["Nome", "Litros"], [["Jose", 12.5]]);
ok("comeca com BOM", csv.startsWith("﻿"));
ok("separa por ponto e virgula", csv.includes("Nome;Litros"));
ok("decimal com virgula", csv.includes("Jose;12,5"));
ok("quebra de linha CRLF", csv.includes("\r\n"));
ok("termina com quebra de linha", csv.endsWith("\r\n"));

console.log("\n== CELULA QUE QUEBRARIA AS COLUNAS ==");
// Um comentario de motorista com ponto e virgula empurraria o resto da
// linha uma coluna para a direita, em silencio.
eq("ponto e virgula vira celula entre aspas",
  montarCsv(["c"], [["a; b"]]).trim().split("\r\n")[1], '"a; b"');
eq("aspas sao dobradas",
  montarCsv(["c"], [['diz "oi"']]).trim().split("\r\n")[1], '"diz ""oi"""');
// Entre aspas, a quebra e conteudo da celula -- nao inicia linha nova.
// E por isso que dividir o arquivo por "\r\n" continua devolvendo uma
// entrada so aqui.
eq("quebra de linha dentro da celula fica entre aspas",
  montarCsv(["c"], [["linha1\nlinha2"]]).trim().split("\r\n")[1], '"linha1\nlinha2"');

console.log("\n== VAZIOS E TIPOS ==");
eq("nulo vira celula vazia", montarCsv(["a", "b"], [[null, undefined]]).trim().split("\r\n")[1], ";");
eq("inteiro nao ganha casas decimais", montarCsv(["n"], [[7]]).trim().split("\r\n")[1], "7");
eq("booleano em portugues", montarCsv(["s"], [[true]]).trim().split("\r\n")[1], "Sim");
// Zero e um valor, nao um vazio: uma linha "0" virando "" faria a media
// da coluna subir sozinha.
eq("zero e um valor", montarCsv(["n"], [[0]]).trim().split("\r\n")[1], "0");

console.log("\n== NUMERO ==");
eq("duas casas por padrao", numeroCsv(3.14159), "3,14");
eq("casas configuraveis", numeroCsv(3.14159, 3), "3,142");
eq("zero", numeroCsv(0), "0,00");
eq("nulo", numeroCsv(null), "");
// NaN escapa de qualquer conta que divide por zero -- "NaN" numa planilha
// contamina toda formula que a referencia.
eq("NaN nao vira texto na planilha", numeroCsv(NaN), "");
eq("infinito tambem nao", numeroCsv(Infinity), "");

console.log("\n== NOME DO ARQUIVO ==");
ok("termina em .csv", nomeDoArquivo("uso-do-app").endsWith(".csv"));
ok("carrega a data", /\d{4}-\d{2}-\d{2}\.csv$/.test(nomeDoArquivo("uso-do-app")));
ok("aceita um complemento", nomeDoArquivo("feedbacks", "90-dias").includes("90-dias"));

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
