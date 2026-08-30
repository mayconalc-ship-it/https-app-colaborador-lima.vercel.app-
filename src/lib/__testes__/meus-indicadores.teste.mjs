// Confere o resumo contra a PLANILHA REAL da RV. O casamento e por
// rotulo digitado a mao ("Qt. Rec." tem ponto, "% Devolução " tem espaco
// sobrando), entao so o arquivo de verdade prova que funciona.
//   $env:RV_PLANILHA_DU = "<id da planilha de Distribuicao>"
//   npx tsx src/lib/__testes__/meus-indicadores.teste.mjs
import { montarResumo, vazio, CAMPOS_DO_RESUMO, paraNumero, formatarCampo } from "../meus-indicadores.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

console.log("== CASAMENTO DE ROTULO ==");
const det = (pares) => pares.map(([rotulo, valor]) => ({ rotulo, valor }));

let r = montarResumo(det([["Qt Entrega", "408"], ["Qt. Rec.", "1"]]));
eq("acha Qt Entrega", r.find((c) => c.chave === "qt_entrega").valor, "408");
eq("acha Qt. Rec. mesmo com pontos", r.find((c) => c.chave === "qt_rec").valor, "1");
eq("campo ausente vira nulo, nao zero", r.find((c) => c.chave === "qt_mapa").valor, null);

// O cabecalho e digitado a mao: espaco sobrando e caixa trocada acontecem.
r = montarResumo(det([["  % DEVOLUÇÃO  ", "1,23%"], ["QT CAIXAS", "3.087,06"]]));
eq("ignora espaco sobrando e caixa", r.find((c) => c.chave === "pct_devolucao").valor, "1,23%");
eq("idem para caixas", r.find((c) => c.chave === "qt_caixas").valor, "3.087,06");

// "Valor devolução" e "TT-Devolução" NAO podem virar "Qt Devolução".
r = montarResumo(det([["Valor devolução", "R$ 120,00"], ["TT-Devolução", "R$ 633,45"]]));
eq("nao confunde Valor devolucao com Qt Devolucao", r.find((c) => c.chave === "qt_devolucao").valor, null);

console.log("\n== LER NUMERO (portugues e ingles) ==");
eq("virgula decimal com milhar", paraNumero("3.087,06"), 3087.06);
eq("so virgula decimal", paraNumero("889,19"), 889.19);
eq("ponto como milhar (3 digitos)", paraNumero("3.087"), 3087);
eq("ponto como decimal", paraNumero("3.5"), 3.5);
eq("inteiro puro", paraNumero("408"), 408);
eq("tira o sinal de porcento", paraNumero("1,23%"), 1.23);
eq("milhar duplo", paraNumero("1.234.567,89"), 1234567.89);
eq("texto nao numerico vira nulo", paraNumero("abc"), null);
eq("vazio vira nulo", paraNumero(""), null);
eq("nulo vira nulo", paraNumero(null), null);

console.log("\n== FORMATAR PARA A TELA ==");
eq("caixas ganham separador de milhar", formatarCampo("3087.06", "decimal"), "3.087,06");
eq("caixas ja formatadas continuam iguais", formatarCampo("3.087,06", "decimal"), "3.087,06");
eq("caixas abaixo de mil nao ganham ponto", formatarCampo("889,19", "decimal"), "889,19");
eq("caixas sempre com duas casas", formatarCampo("3087", "decimal"), "3.087,00");
eq("caixas arredondam para duas casas", formatarCampo("3087,456", "decimal"), "3.087,46");

eq("percentual ja em % continua", formatarCampo("1,23%", "percentual"), "1,23%");
// O caso que o dono relatou: veio decimal em vez de porcentagem.
eq("decimal vira porcentagem", formatarCampo("0,0123", "percentual"), "1,23%");
eq("decimal em ingles tambem", formatarCampo("0.0123", "percentual"), "1,23%");
eq("percentual sem sinal acima de 1 fica como esta", formatarCampo("2,24", "percentual"), "2,24%");
eq("zero vira 0,00%", formatarCampo("0", "percentual"), "0,00%");
eq("percentual arredonda para duas casas", formatarCampo("1,236%", "percentual"), "1,24%");
// 0,60% tem % e vale menos que 1 -- nao pode virar 60%.
eq("meio porcento COM sinal nao vira 60%", formatarCampo("0,60%", "percentual"), "0,60%");

eq("inteiro ganha separador", formatarCampo("1204", "inteiro"), "1.204");
eq("inteiro pequeno sem separador", formatarCampo("24", "inteiro"), "24");
eq("texto que nao e numero passa direto", formatarCampo("n/d", "inteiro"), "n/d");
eq("nulo continua nulo", formatarCampo(null, "inteiro"), null);

console.log("\n== VAZIO ==");
ok("nulo e vazio", vazio(null));
ok("traco e vazio", vazio(" - "));
ok("R$ - e vazio", vazio("R$ -"));
ok("zero NAO e vazio", !vazio("0"));

// ---------------- Planilha real ----------------
const ID = process.env.RV_PLANILHA_DU;
if (!ID) {
  console.log("\n== PLANILHA REAL: PULADO (defina RV_PLANILHA_DU) ==");
  console.log(`\n${falhas === 0 ? "OS CASOS PUROS PASSARAM" : falhas + " FALHA(S)"}`);
  process.exit(falhas === 0 ? 0 : 1);
}

function separar(l) {
  const c = []; let a = ""; let asp = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (asp && l[i + 1] === '"') { a += '"'; i++; } else asp = !asp; }
    else if (ch === "," && !asp) { c.push(a); a = ""; }
    else a += ch;
  }
  c.push(a); return c.map((x) => x.trim());
}

console.log("\n== PLANILHA REAL DA RV ==");
const resp = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`, { cache: "no-store" });
ok("baixou a planilha", resp.ok, String(resp.status));
const bytes = new Uint8Array(await resp.arrayBuffer());
const u = new TextDecoder("utf-8").decode(bytes);
const texto = u.includes("�") ? new TextDecoder("latin1").decode(bytes) : u;

const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
let iCab = 0, melhor = 0;
for (let i = 0; i < Math.min(15, linhas.length); i++) {
  const n = separar(linhas[i]).filter(Boolean).length;
  if (n > melhor) { melhor = n; iCab = i; }
}
const cab = separar(linhas[iCab]);
console.log(`  cabecalho na linha ${iCab + 1}, ${cab.filter(Boolean).length} colunas`);

// Monta os detalhes do mesmo jeito que a leitura da RV monta.
const dados = linhas.slice(iCab + 1).map(separar).filter((d) => d.some(Boolean));
console.log(`  ${dados.length} linhas de gente`);
ok("tem linhas", dados.length > 10, String(dados.length));

const detalhesDe = (d) => cab.map((rotulo, i) => ({ rotulo, valor: d[i] ?? "" })).filter((x) => x.rotulo);

const primeira = montarResumo(detalhesDe(dados[0]));
console.log("\n  resumo da primeira linha:");
for (const c of primeira) console.log(`     ${c.titulo.padEnd(14)} ${c.valor ?? "(nao achou)"}`);

const naoAchados = primeira.filter((c) => c.valor === null);
ok("todos os 6 campos foram achados na planilha real", naoAchados.length === 0,
  naoAchados.map((c) => c.titulo).join(", "));

// Nenhuma coluna em REAIS pode vazar para o resumo.
const comReais = primeira.filter((c) => c.valor && /R\$/.test(c.valor));
ok("nenhum valor em reais entrou no resumo", comReais.length === 0,
  comReais.map((c) => `${c.titulo}=${c.valor}`).join(" | "));

// Funciona para todo mundo, nao so para a primeira linha?
let semTudo = 0;
for (const d of dados) {
  const r2 = montarResumo(detalhesDe(d));
  if (r2.some((c) => c.valor === null)) semTudo++;
}
console.log(`\n  linhas em que algum campo ficou sem valor: ${semTudo} de ${dados.length}`);
ok("a maioria das linhas tem todos os campos", semTudo / dados.length < 0.2,
  `${((semTudo / dados.length) * 100).toFixed(0)}%`);

console.log(`\n  campos configurados: ${CAMPOS_DO_RESUMO.map((c) => c.titulo).join(", ")}`);
console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
