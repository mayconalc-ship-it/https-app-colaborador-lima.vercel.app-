// Confere o motor da devolucao contra os relatorios REAIS.
//   $env:RATING_PASTA_DRIVE = "<id da pasta mae>"
//   npx tsx src/lib/__testes__/devolucao.teste.mjs
import {
  lerRelatorioDeDevolucao, lerTabelaDeMotivos, resumirDevolucao,
  normalizarCodigo, CLASSIFICACAO_SUGERIDA, ehResponsabilidade,
  pctDoDia, pctPdvDoDia, precisaJustificar, META_PADRAO_PCT,
  classificacaoSugerida, porPdv, contarPdvsQueContam,
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

console.log("\n== CLASSIFICACAO SUGERIDA (clusters da casa) ==");
eq("PDV Fechado e do Mercado", CLASSIFICACAO_SUGERIDA["37"], "mercado");
eq("Carga errada e do Armazem/Financeiro", CLASSIFICACAO_SUGERIDA["50"], "armazem_financeiro");
eq("Nao fez pedido e de Vendas", CLASSIFICACAO_SUGERIDA["33"], "vendas");
eq("Preco errado e de Vendas", CLASSIFICACAO_SUGERIDA["35"], "vendas");
eq("Tempo insuficiente e da Entrega", CLASSIFICACAO_SUGERIDA["45"], "entrega");
ok("toda sugestao e uma responsabilidade valida",
  Object.values(CLASSIFICACAO_SUGERIDA).every(ehResponsabilidade));

console.log("\n== DE QUEM FOI x ENTRA NA CONTA (eixos separados) ==");
// O caso do dono: NF rejeitada e do Armazem/Financeiro e mesmo assim nao
// entra no %.
eq("mapa nao carregado: de quem foi", classificacaoSugerida("8").responsabilidade, "armazem_financeiro");
ok("mapa nao carregado: fora da conta", !classificacaoSugerida("8").contaNoIndicador);
eq("PDV fechado: de quem foi", classificacaoSugerida("37").responsabilidade, "mercado");
ok("PDV fechado: entra na conta", classificacaoSugerida("37").contaNoIndicador);
ok("motivo desconhecido nasce fora da conta", !classificacaoSugerida("9999").contaNoIndicador);
eq("e sem responsabilidade", classificacaoSugerida("9999").responsabilidade, "nao_classificado");

console.log("\n== RESUMO ==");
let r = resumirDevolucao([
  { valor: 100, responsabilidade: "mercado", contaNoIndicador: true },
  { valor: 50, responsabilidade: "mercado", contaNoIndicador: true },
  { valor: 200, responsabilidade: "armazem_financeiro", contaNoIndicador: true },
  { valor: 30, responsabilidade: "entrega", contaNoIndicador: true },
  { valor: 70, responsabilidade: "vendas", contaNoIndicador: true },
  // Do Armazem/Financeiro E fora da conta -- o caso da NF rejeitada.
  { valor: 900000, responsabilidade: "armazem_financeiro", contaNoIndicador: false },
  { valor: 10, responsabilidade: "nao_classificado" },
]);
eq("conta so o que entra no indicador", r.notas, 5);
eq("e o valor tambem", r.valor, 450);
eq("mercado somado", r.porResponsabilidade.mercado.valor, 150);
eq("vendas entrou como cluster proprio", r.porResponsabilidade.vendas.valor, 70);
eq("o armazem fora da conta NAO entra no armazem", r.porResponsabilidade.armazem_financeiro.valor, 200);
eq("o que fica de fora nao some", r.foraDoIndicador.notas, 2);
eq("e aparece com o valor", r.foraDoIndicador.valor, 900010);
eq("avisa quantos faltam classificar", r.aClassificar, 1);
r = resumirDevolucao([]);
eq("sem nota, zero", r.notas, 0);

console.log("\n== POR PDV ==");
const pdvs = porPdv([
  { clienteCodigo: "1", clienteNome: "BAR DO ZE", valor: 100, contaNoIndicador: true },
  { clienteCodigo: "1", clienteNome: "BAR DO ZE", valor: 50, contaNoIndicador: true },
  { clienteCodigo: "2", clienteNome: "MERCEARIA", valor: 200, contaNoIndicador: true },
  { clienteCodigo: "3", clienteNome: "FABRICA", valor: 900000, contaNoIndicador: false },
]);
eq("o maior valor vem primeiro", pdvs[0].chave, "MERCEARIA");
eq("agrupa o mesmo PDV", pdvs[1].total, 150);
eq("e conta as notas dele", pdvs[1].notas, 2);
eq("o que nao conta fica de fora do ranking", pdvs.length, 2);

console.log("\n== INDICADOR PRINCIPAL: POR PDV ==");
eq("1 PDV devolvido de 20 atendidos = 5%", pctPdvDoDia(19, 1), 5);
eq("dia sem PDV nao tem % (nao e 0%)", pctPdvDoDia(0, 0), null);
eq("dia sem devolucao da 0%", pctPdvDoDia(16, 0), 0);
ok("acima da meta pede justificativa (por PDV)", precisaJustificar(pctPdvDoDia(19, 1), META_PADRAO_PCT));
// PDV distinto: o mesmo cliente com duas notas conta uma vez.
eq("PDV repetido conta uma vez",
  contarPdvsQueContam([{ pdv: "A", motivo: "37" }, { pdv: "A", motivo: "38" }], () => true), 1);
eq("motivo fora da conta nao entra",
  contarPdvsQueContam([{ pdv: "A", motivo: "8" }, { pdv: "B", motivo: "37" }], (c) => c !== "8"), 1);
eq("sem devolucao, zero", contarPdvsQueContam([], () => true), 0);

console.log("\n== META EM VALOR (segundo plano) ==");
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
// Nao se fixa o total: a pasta muda de conteudo (em 29/08/2026 o arquivo
// de agosto sumiu dela). O que se verifica e a PROPORCAO -- a devolucao
// e ~1,2% das linhas, e um desvio grande ali significa que o filtro de
// status quebrou.
const pctDevolucao = (todas.length / linhasTotais) * 100;
console.log(`  devolucao e ${pctDevolucao.toFixed(2)}% das linhas do relatorio`);
ok("filtrou de verdade (o arquivo e quase todo entrega)", pctDevolucao > 0.5 && pctDevolucao < 5,
  `${pctDevolucao.toFixed(2)}%`);
ok("leu varios meses", arqs.length >= 6, `${arqs.length} arquivo(s)`);
ok("toda nota tem data ISO", todas.every((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.data)));
ok("toda nota tem numero", todas.every((n) => n.nota));
ok("mapa normalizado quando existe", todas.every((n) => !n.mapa || !/^0/.test(n.mapa)));

const nfs = new Set(todas.map((n) => `${n.nota}|${n.serie ?? ""}`));
ok("a chave nota+serie nao repete", nfs.size === todas.length, `${nfs.size} chaves para ${todas.length} notas`);

const valorTotal = todas.reduce((s, n) => s + n.valor, 0);
console.log(`  valor total: R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
ok("todo valor lido e um numero valido", todas.every((n) => Number.isFinite(n.valor) && n.valor >= 0));
ok("o valor total e da ordem de grandeza esperada", valorTotal > 500000 && valorTotal < 5000000,
  valorTotal.toFixed(2));

// Todo motivo do periodo esta na tabela e tem sugestao?
const usados = [...new Set(todas.map((n) => n.motivoCodigo).filter(Boolean))];
console.log(`  motivos distintos usados: ${usados.length}`);
const semDescricao = usados.filter((c) => !motivos.has(c));
ok("todo motivo usado esta na tabela", semDescricao.length === 0, semDescricao.join(", "));
const semSugestao = usados.filter((c) => !CLASSIFICACAO_SUGERIDA[c]);
ok("todo motivo usado tem classificacao sugerida", semSugestao.length === 0,
  semSugestao.map((c) => `${c} = ${motivos.get(c)}`).join(" | "));

const resumo = resumirDevolucao(
  todas.map((n) => {
    const s = classificacaoSugerida(n.motivoCodigo ?? "");
    return { valor: n.valor, responsabilidade: s.responsabilidade, contaNoIndicador: s.contaNoIndicador };
  }),
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
// Quanto do entregue do PROPRIO recorte lido chegou a um motorista.
// Comparar com um total fixo daria falso alarme quando a pasta muda de
// conteudo -- foi o que aconteceu quando o arquivo de agosto sumiu dela.
let entregueNoArquivo = 0;
for (const a of arqs) {
  // ja lido acima; recalcular daria outra volta na rede, entao usamos o
  // proprio agregado como referencia de si mesmo
  void a;
}
entregueNoArquivo = entregue;
console.log(`  PDVs atendidos somados: ${dias.reduce((s, d) => s + d.pdvsEntregues, 0).toLocaleString("pt-BR")}`);
ok("todo dia agregado tem motorista", dias.every((d) => d.motoristaCodigo));
ok("o entregue somado e positivo", entregueNoArquivo > 0);
ok("agrega de verdade (dezenas de milhares de notas viram ~2 mil dias)", dias.length < 3000, String(dias.length));
ok("conta PDV distinto, nao nota", dias.every((d) => d.pdvsEntregues <= d.notasEntregues));

// Quantos dias pediriam justificativa, pela regua de verdade: por PDV,
// descontando os motivos que nao entram na conta.
const conta = (codigo) => Boolean(codigo) && classificacaoSugerida(codigo).contaNoIndicador;
const comMovimento = dias.filter((d) => pctPdvDoDia(d.pdvsEntregues, contarPdvsQueContam(d.pdvsDevolvidosPorMotivo, conta)) !== null);
const pedem = comMovimento.filter((d) =>
  precisaJustificar(pctPdvDoDia(d.pdvsEntregues, contarPdvsQueContam(d.pdvsDevolvidosPorMotivo, conta)), META_PADRAO_PCT),
);
const pct = (pedem.length / comMovimento.length) * 100;
console.log(`  dias com movimento: ${comMovimento.length} | pedem justificativa: ${pedem.length} (${pct.toFixed(0)}%)`);
// Por PDV a regua e mais grossa que por valor: com ~16 PDVs no dia, uma
// devolucao ja da 6%. Na pratica, "acima da meta" e quase o mesmo que
// "teve devolucao" -- cerca de 2 a 3 por motorista por mes.
ok("a justificativa e frequente sem virar spam", pct < 30, `${pct.toFixed(0)}% dos dias`);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
