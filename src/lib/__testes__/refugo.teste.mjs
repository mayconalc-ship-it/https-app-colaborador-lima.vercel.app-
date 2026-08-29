// Confere o motor do refugo contra o relatorio REAL do Drive.
// A pasta vem do ambiente -- id de arquivo compartilhado E link, e este
// repositorio e publico.
//   $env:RATING_PASTA_DRIVE = "<id da pasta mae>"
//   npx tsx src/lib/__testes__/refugo.teste.mjs
import {
  lerRelatorioDeRefugo, resumirRefugo, somarDefeitos, alertaDaAfericao,
  normalizarCodigo, DEFEITO_FALTANTE,
} from "../refugo.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado || (typeof obtido === "number" && typeof esperado === "number" && Math.abs(obtido - esperado) < 0.005);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

console.log("== CODIGO ==");
eq("tira o zero a esquerda", normalizarCodigo("01026"), "1026");
eq("zero puro vira nulo", normalizarCodigo("00000"), null);
eq("vazio vira nulo", normalizarCodigo(""), null);

console.log("\n== ALERTA DE DESTOANTE ==");
eq("2616 de 2616 = erro de lancamento", alertaDaAfericao(2616, 2616), "erro_de_lancamento");
eq("300 de 1000 = acima do normal", alertaDaAfericao(1000, 300), "acima_do_normal");
eq("11 de 37 e ruido, nao alerta", alertaDaAfericao(37, 11), null);
eq("refugo zero nao alerta", alertaDaAfericao(2000, 0), null);
eq("1 de 24 nao alerta", alertaDaAfericao(24, 1), null);

console.log("\n== RESUMO E VALOR ==");
const linhas = [
  { totalAferido: 1000, qtFaltante: 10, qtQualidade: 5, itemCodigo: "A" },
  { totalAferido: 1000, qtFaltante: 0, qtQualidade: 5, itemCodigo: "B" },
];
let r = resumirRefugo(linhas, new Map([["A", 2], ["B", 3]]));
eq("aferido", r.totalAferido, 2000);
eq("faltante", r.qtFaltante, 10);
eq("qualidade", r.qtQualidade, 10);
eq("refugo", r.refugo, 20);
eq("% refugo", r.pctRefugo, 1);
eq("valor: 15x2 + 5x3", r.valor, 45);
r = resumirRefugo(linhas, new Map([["A", 2]]));
eq("faltando preco de um item, o valor e nulo", r.valor, null);
eq("e a tela sabe qual item falta", r.itensSemValor[0], "B");
r = resumirRefugo([], new Map());
eq("sem afericao, % e nulo e nao zero", r.pctRefugo, null);

console.log("\n== SOMA DE DEFEITOS ==");
const soma = somarDefeitos([
  { defeitos: { Quebrada: 2, Faltante: 10 } },
  { defeitos: { Quebrada: 3 } },
  { defeitos: {} },
]);
eq("o maior vem primeiro", soma[0].defeito, "Faltante");
eq("com o total certo", soma[0].total, 10);
eq("somou as quebradas", soma[1].total, 5);

// ---------------- Relatorio real ----------------
const PASTA = process.env.RATING_PASTA_DRIVE;
if (!PASTA) {
  console.log("\n== RELATORIO REAL: PULADO (defina RATING_PASTA_DRIVE) ==");
  console.log(`\n${falhas === 0 ? "OS CASOS PUROS PASSARAM" : falhas + " FALHA(S)"}`);
  process.exit(falhas === 0 ? 0 : 1);
}

const RE_SSK = /ssk='[^']*?:([a-zA-Z0-9_-]{25,44})-\d+-\d+'/;
async function pagina(id) {
  const r = await fetch(`https://drive.google.com/drive/folders/${id}`, { headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  return r.ok ? await r.text() : "";
}
function itens(html, pastas) {
  const out = [];
  for (const m of html.matchAll(/aria-label=\\?"([^"\\]{2,160})"/g)) {
    const rot = m[1]; const ehPasta = /\sShared folder$/i.test(rot);
    if (pastas !== ehPasta) continue;
    let nome;
    if (ehPasta) nome = rot.replace(/\sShared folder$/i, "").trim();
    else { const e = rot.match(/([\w\-. ()]+\.(?:csv|xlsx|xls))/i); if (!e) continue; nome = e[1].trim(); }
    const a = html.slice(m.index, m.index + 400).match(RE_SSK);
    if (a && !out.some((o) => o.id === a[1])) out.push({ id: a[1], nome });
  }
  return out;
}
async function texto(id) {
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download`, { cache: "no-store" });
  const b = new Uint8Array(await r.arrayBuffer());
  const u = new TextDecoder("utf-8").decode(b);
  return u.includes("�") ? new TextDecoder("latin1").decode(b) : u;
}

console.log("\n== RELATORIO REAL DO DRIVE ==");
const sub = itens(await pagina(PASTA), true).find((s) => /refugo/i.test(s.nome));
ok("achou a pasta Refugo dentro da pasta mae", Boolean(sub));
const arq = itens(await pagina(sub.id), false)[0];
const lido = lerRelatorioDeRefugo(await texto(arq.id));

console.log(`  ${arq.nome}: ${lido.afericoes.length} afericoes, ${lido.ignoradas} ignoradas`);
ok("achou as colunas obrigatorias", lido.faltando.length === 0, lido.faltando.join(", "));
ok("leu 400+ afericoes", lido.afericoes.length > 400, String(lido.afericoes.length));
ok("a conta do relatorio fecha em TODAS as linhas", lido.contaNaoFecha === 0, `${lido.contaNaoFecha} nao fecham`);
ok("todo mapa normalizado", lido.afericoes.every((a) => !/^0/.test(a.mapa)));
ok("toda data em ISO", lido.afericoes.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.data)));
ok("todo motorista tem codigo", lido.afericoes.every((a) => a.motoristaCodigo));
ok("todo conferente tem nome", lido.afericoes.every((a) => a.conferenteNome));

const resumo = resumirRefugo(
  lido.afericoes.map((a) => ({ totalAferido: a.totalAferido, qtFaltante: a.qtFaltante, qtQualidade: a.qtQualidade, itemCodigo: a.itemCodigo })),
  new Map(),
);
console.log(`  aferido ${resumo.totalAferido.toLocaleString("pt-BR")} | faltante ${resumo.qtFaltante} | qualidade ${resumo.qtQualidade} | refugo ${resumo.pctRefugo}%`);
ok("aferido bate com o medido na base (708.963)", resumo.totalAferido === 708963, String(resumo.totalAferido));
ok("refugo bate com o medido (3.407)", resumo.refugo === 3407, String(resumo.refugo));
ok("faltante e a maior fatia", resumo.qtFaltante > resumo.qtQualidade);
ok("sem preco cadastrado, o valor e nulo", resumo.valor === null);

const itensDistintos = new Set(lido.afericoes.map((a) => a.itemCodigo));
console.log(`  itens distintos (precisam de preco): ${itensDistintos.size}`);
ok("poucos itens para cadastrar", itensDistintos.size <= 10, String(itensDistintos.size));

const comAlerta = lido.afericoes.filter((a) => alertaDaAfericao(a.totalAferido, a.qtFaltante + a.qtQualidade));
console.log(`  afericoes com alerta em 8 meses: ${comAlerta.length}`);
for (const a of comAlerta) console.log(`     ${a.data} mapa ${a.mapa} | ${a.qtFaltante + a.qtQualidade}/${a.totalAferido} | ${a.motoristaNome}`);
ok("o alerta e raro (nao vira ruido)", comAlerta.length <= 3, String(comAlerta.length));
ok("pegou o mapa 13633", comAlerta.some((a) => a.mapa === "13633"));

console.log("\n  defeitos somados:");
for (const d of somarDefeitos(lido.afericoes)) console.log(`    ${String(d.total).padStart(5)}  ${d.defeito}`);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
