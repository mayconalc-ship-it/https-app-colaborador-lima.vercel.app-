// Confere o motor da devolucao contra os relatorios REAIS.
//   $env:RATING_PASTA_DRIVE = "<id da pasta mae>"
//   npx tsx src/lib/__testes__/devolucao.teste.mjs
import {
  lerRelatorioDeDevolucao, lerTabelaDeMotivos, resumirDevolucao,
  normalizarCodigo, CLASSIFICACAO_SUGERIDA, ehResponsabilidade,
  pctDoDia, precisaJustificar, META_PADRAO_PCT,
} from "../devolucao.ts";

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
eq("tira zero a esquerda", normalizarCodigo("0037"), "37");
eq("zero puro vira nulo", normalizarCodigo("0"), null);
eq("vazio vira nulo", normalizarCodigo(" "), null);

console.log("\n== CLASSIFICACAO SUGERIDA ==");
eq("PDV Fechado e do cliente", CLASSIFICACAO_SUGERIDA["37"], "cliente");
eq("Carga errada do armazem e da operacao", CLASSIFICACAO_SUGERIDA["50"], "operacao");
eq("Tempo insuficiente e da entrega", CLASSIFICACAO_SUGERIDA["45"], "entrega");
eq("Mapa nao carregado fica fora do indicador", CLASSIFICACAO_SUGERIDA["8"], "nao_conta");
ok("toda sugestao e uma responsabilidade valida",
  Object.values(CLASSIFICACAO_SUGERIDA).every(ehResponsabilidade));

console.log("\n== RESUMO ==");
let r = resumirDevolucao([
  { valor: 100, responsabilidade: "cliente" },
  { valor: 50, responsabilidade: "cliente" },
  { valor: 200, responsabilidade: "operacao" },
  { valor: 30, responsabilidade: "entrega" },
  { valor: 900000, responsabilidade: "nao_conta" },
  { valor: 10, responsabilidade: "nao_classificado" },
]);
eq("conta so o que entra no indicador", r.notas, 4);
eq("e o valor tambem", r.valor, 380);
eq("cliente somado", r.porResponsabilidade.cliente.valor, 150);
eq("o que fica de fora nao some", r.foraDoIndicador.notas, 2);
eq("e aparece com o valor", r.foraDoIndicador.valor, 900010);
eq("avisa quantos faltam classificar", r.aClassificar, 1);
r = resumirDevolucao([]);
eq("sem nota, zero", r.notas, 0);

console.log("\n== META DO DIA ==");
eq("100 devolvido de 900 entregue = 10%", pctDoDia(900, 100), 10);
eq("dia sem movimento nao tem % (nao e 0%)", pctDoDia(0, 0), null);
eq("dia so com entrega da 0%", pctDoDia(1000, 0), 0);
// Uma nota de transferencia nao pode jogar o dia para 96%.
eq("a transferencia sai dos dois lados", pctDoDia(20000, 547000, 547000), 0);
eq("e o resto continua contando", pctDoDia(9900, 547100, 547000), 1);
ok("acima da meta pede justificativa", precisaJustificar(2.0, META_PADRAO_PCT));
ok("na meta nao pede", !precisaJustificar(1.6, META_PADRAO_PCT));
ok("dia sem movimento nunca pede", !precisaJustificar(null, META_PADRAO_PCT));

// ---------------- Relatorios reais ----------------
const PASTA = process.env.RATING_PASTA_DRIVE;
if (!PASTA) {
  console.log("\n== RELATORIOS REAIS: PULADO (defina RATING_PASTA_DRIVE) ==");
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

console.log("\n== RELATORIOS REAIS ==");
const subs = itens(await pagina(PASTA), true);

const pMot = subs.find((s) => s.nome.trim() === "01.20.01.06");
ok("achou a pasta de motivos", Boolean(pMot));
const motivos = lerTabelaDeMotivos(await texto(itens(await pagina(pMot.id), false)[0].id));
console.log(`  tabela de motivos: ${motivos.size} codigos`);
ok("leu 90+ motivos", motivos.size > 90, String(motivos.size));
eq("codigo 37 e PDV Fechado", motivos.get("37"), "PDV Fechado");
eq("codigo 8 e o do mapa nao carregado", motivos.get("8"), "Mapa nao carregado / nao canc.");

const pDev = subs.find((s) => s.nome.trim() === "03.02.37");
ok("achou a pasta 03.02.37", Boolean(pDev));
const arqs = itens(await pagina(pDev.id), false);
console.log(`  arquivos mensais: ${arqs.length}`);

let todas = [];
let dias = [];
let linhasTotais = 0;
for (const a of arqs) {
  const lido = lerRelatorioDeDevolucao(await texto(a.id));
  if (lido.faltando.length) { ok(`${a.nome} tem as colunas`, false, lido.faltando.join(", ")); continue; }
  todas = todas.concat(lido.notas);
  dias = dias.concat(lido.dias);
  linhasTotais += lido.linhasLidas;
}
console.log(`  ${linhasTotais.toLocaleString("pt-BR")} linhas lidas -> ${todas.length} devolucoes`);
ok("bate com o medido na base (727)", todas.length === 727, String(todas.length));
ok("filtrou de verdade (60 mil linhas viram 727)", linhasTotais > 50000);
ok("toda nota tem data ISO", todas.every((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.data)));
ok("toda nota tem numero", todas.every((n) => n.nota));
ok("mapa normalizado quando existe", todas.every((n) => !n.mapa || !/^0/.test(n.mapa)));

const nfs = new Set(todas.map((n) => `${n.nota}|${n.serie ?? ""}`));
ok("a chave nota+serie nao repete", nfs.size === todas.length, `${nfs.size} chaves para ${todas.length} notas`);

const valorTotal = todas.reduce((s, n) => s + n.valor, 0);
console.log(`  valor total: R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
ok("valor bate com o medido (1.450.187,11)", Math.abs(valorTotal - 1450187.11) < 1, valorTotal.toFixed(2));

// Todo motivo do periodo esta na tabela e tem sugestao?
const usados = [...new Set(todas.map((n) => n.motivoCodigo).filter(Boolean))];
console.log(`  motivos distintos usados: ${usados.length}`);
const semDescricao = usados.filter((c) => !motivos.has(c));
ok("todo motivo usado esta na tabela", semDescricao.length === 0, semDescricao.join(", "));
const semSugestao = usados.filter((c) => !CLASSIFICACAO_SUGERIDA[c]);
ok("todo motivo usado tem classificacao sugerida", semSugestao.length === 0,
  semSugestao.map((c) => `${c} = ${motivos.get(c)}`).join(" | "));

const resumo = resumirDevolucao(
  todas.map((n) => ({ valor: n.valor, responsabilidade: CLASSIFICACAO_SUGERIDA[n.motivoCodigo] ?? "nao_classificado" })),
);
console.log(`\n  com a classificacao sugerida:`);
for (const [k, v] of Object.entries(resumo.porResponsabilidade))
  console.log(`     ${k.padEnd(18)} ${String(v.notas).padStart(4)} notas  R$ ${v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }).padStart(14)}`);
console.log(`     ---`);
console.log(`     ENTRA no indicador  ${String(resumo.notas).padStart(4)} notas  R$ ${resumo.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
ok("a transferencia de R$ 836 mil ficou fora", resumo.valor < 600000, `R$ ${resumo.valor.toFixed(2)}`);
ok("nada ficou sem classificar", resumo.aClassificar === 0, String(resumo.aClassificar));

// ---- O denominador ----
console.log(`\n== O DIA DE CADA MOTORISTA (denominador) ==`);
const entregue = dias.reduce((s, d) => s + d.valorEntregue, 0);
const devolvido = dias.reduce((s, d) => s + d.valorDevolvido, 0);
console.log(`  ${dias.length} pares motorista-dia`);
console.log(`  entregue  R$ ${entregue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
console.log(`  devolvido R$ ${devolvido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
// O agregado so conta linha COM codigo de motorista -- nota entregue sem
// motorista nao pode entrar no dia de ninguem. O arquivo inteiro soma
// R$ 73,3 milhoes; o que da para atribuir e ~93% disso. A diferenca nao e
// perda: e nota que o relatorio nao diz quem levou.
const PCT_ATRIBUIDO = entregue / 73341603.94;
console.log(`  atribuido a um motorista: ${(PCT_ATRIBUIDO * 100).toFixed(1)}% do entregue do arquivo`);
ok("a maior parte do entregue tem dono", PCT_ATRIBUIDO > 0.9, `${(PCT_ATRIBUIDO * 100).toFixed(1)}%`);
ok("agrega de verdade (58 mil notas viram ~2 mil dias)", dias.length < 3000, String(dias.length));

// Quantos dias pediriam justificativa com a meta padrao?
const foraPorDia = new Map();
for (const n of todas) {
  if ((CLASSIFICACAO_SUGERIDA[n.motivoCodigo] ?? "nao_classificado") !== "nao_conta") continue;
  const k = `${n.data}|${n.motoristaCodigo}`;
  foraPorDia.set(k, (foraPorDia.get(k) ?? 0) + n.valor);
}
const comMovimento = dias.filter((d) => pctDoDia(d.valorEntregue, d.valorDevolvido, foraPorDia.get(`${d.data}|${d.motoristaCodigo}`) ?? 0) !== null);
const pedem = comMovimento.filter((d) =>
  precisaJustificar(pctDoDia(d.valorEntregue, d.valorDevolvido, foraPorDia.get(`${d.data}|${d.motoristaCodigo}`) ?? 0), META_PADRAO_PCT),
);
console.log(`  dias com movimento: ${comMovimento.length} | pedem justificativa: ${pedem.length} (${(pedem.length / comMovimento.length * 100).toFixed(0)}%)`);
ok("a justificativa e frequente sem virar spam", pedem.length / comMovimento.length < 0.2,
  `${(pedem.length / comMovimento.length * 100).toFixed(0)}% dos dias`);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
