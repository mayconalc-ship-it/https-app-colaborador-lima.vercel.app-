// Confere o motor do rating contra os ARQUIVOS REAIS do Drive, nao
// contra dados inventados -- e o unico jeito de saber que o leitor
// aguenta o que o LOG.CO exporta de verdade.
// Rode: npx tsx src/lib/__testes__/rating.teste.mjs
import ExcelJS from "exceljs";
import {
  classificacaoDaNota, cpfValido, normalizarCpf, precisaFeedback,
  lerCadastroPessoas, lerViagens, lerAvaliacoes, resumirRating,
  desenhoDasEstrelas, motivosMaisComuns,
} from "../rating.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado || (typeof obtido === "number" && Math.abs(obtido - esperado) < 0.005);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

// ---------------- 1. Parte pura ----------------
console.log("== CLASSIFICACAO ==");
eq("nota 1", classificacaoDaNota(1), "detrator");
eq("nota 3", classificacaoDaNota(3), "detrator");
eq("nota 4", classificacaoDaNota(4), "neutro");
eq("nota 5", classificacaoDaNota(5), "promotor");
ok("nota 4 pede feedback (meta e 5)", precisaFeedback(4));
ok("nota 5 nao pede", !precisaFeedback(5));

console.log("\n== CPF ==");
eq("completa o zero a esquerda", normalizarCpf("44.569.881.00"), "04456988100");
eq("ja valido passa direto", normalizarCpf("868.122.461.15"), "86812246115");
eq("CPF falso e recusado", normalizarCpf("111.111.111.11"), null);
eq("vazio e nulo", normalizarCpf(""), null);
ok("digito verificador funciona", cpfValido("04456988100") && !cpfValido("04456988101"));

console.log("\n== RESUMO ==");
let r = resumirRating([
  { nota: 5, classificacao: "promotor" }, { nota: 5, classificacao: "promotor" },
  { nota: 4, classificacao: "neutro" }, { nota: 1, classificacao: "detrator" },
]);
eq("total", r.total, 4);
eq("media", r.media, 3.75);
eq("estrelas (meia em meia)", r.estrelas, 4);
eq("detratores", r.detratores, 1);
eq("abaixo da meta", r.abaixoDaMeta, 2);
r = resumirRating([]);
eq("sem avaliacao a media e nula, nao zero", r.media, null);
const d = desenhoDasEstrelas(4.5);
ok("4,5 estrelas = 4 cheias + 1 meia", d.cheias === 4 && d.meia && d.vazias === 0);

// ---------------- 2. Arquivos reais ----------------
//
// NENHUM id de arquivo do Drive fica escrito aqui: este repositorio e
// publico, e o id de um arquivo compartilhado por link E o link. Os
// cadastros 01.20.01.47/48 tem 337 CPFs -- publicar o id seria publicar
// os CPFs num lugar que o Google indexa.
//
// A pasta mae vem do ambiente e o teste anda pelas subpastas sozinho,
// igual ao app faz. Sem a variavel, so a parte pura roda.
//
//   $env:RATING_PASTA_DRIVE = "<id da pasta mae>"
//   npx tsx src/lib/__testes__/rating.teste.mjs
const PASTA_RAIZ = process.env.RATING_PASTA_DRIVE;
if (!PASTA_RAIZ) {
  console.log("\n== ARQUIVOS REAIS: PULADO ==");
  console.log("  defina RATING_PASTA_DRIVE com o id da pasta mae para conferir contra os arquivos de verdade.");
  console.log(`\n${falhas === 0 ? "OS CASOS PUROS PASSARAM" : falhas + " FALHA(S)"}`);
  process.exit(falhas === 0 ? 0 : 1);
}

console.log("\n== ARQUIVOS REAIS DO DRIVE ==");

async function texto(id) {
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download`, { cache: "no-store" });
  const b = new Uint8Array(await r.arrayBuffer());
  const u = new TextDecoder("utf-8").decode(b);
  return u.includes("�") ? new TextDecoder("latin1").decode(b) : u;
}
async function bytes(id) {
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download`, { cache: "no-store" });
  const b = Buffer.from(await r.arrayBuffer());
  return b[0] === 0x50 && b[1] === 0x4b ? b : null;
}

// Anda pela pasta do mesmo jeito que lib/drive-pasta.ts anda.
const RE_SSK = /ssk='[^']*?:([a-zA-Z0-9_-]{25,44})-\d+-\d+'/;
async function paginaDaPasta(id) {
  const r = await fetch(`https://drive.google.com/drive/folders/${id}`, {
    headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store",
  });
  return r.ok ? await r.text() : "";
}
function itensDaPagina(html, querPastas) {
  const out = [];
  for (const m of html.matchAll(/aria-label=\\?"([^"\\]{2,160})"/g)) {
    const rotulo = m[1];
    const ehPasta = /\sShared folder$/i.test(rotulo);
    if (querPastas !== ehPasta) continue;
    let nome;
    if (ehPasta) nome = rotulo.replace(/\sShared folder$/i, "").trim();
    else {
      const ext = rotulo.match(/([\w\-. ()]+\.(?:csv|xlsx|xls))/i);
      if (!ext) continue;
      nome = ext[1].trim();
    }
    const ach = html.slice(m.index, m.index + 400).match(RE_SSK);
    if (ach && !out.some((o) => o.id === ach[1])) out.push({ id: ach[1], nome });
  }
  return out;
}

const subpastas = itensDaPagina(await paginaDaPasta(PASTA_RAIZ), true);
ok("achou as subpastas dos relatorios", subpastas.length >= 4, subpastas.map((p) => p.nome).join(", "));

async function arquivosDe(nomePasta) {
  const p = subpastas.find((x) => x.nome.trim() === nomePasta);
  if (!p) return [];
  return itensDaPagina(await paginaDaPasta(p.id), false);
}
const arqMotoristas = await arquivosDe("01.20.01.47");
const arqAjudantes = await arquivosDe("01.20.01.48");
const arqViagens = await arquivosDe("03.11.29");
const arqLogCo = await arquivosDe("LOG.CO");

// --- Cadastro de motoristas (01.20.01.47) ---
const cad = lerCadastroPessoas(await texto(arqMotoristas[0].id), "motorista");
console.log(`\n  cadastro 47: ${cad.pessoas.length} pessoas, ${cad.semCpf} sem CPF utilizavel`);
ok("achou todas as colunas", cad.faltando.length === 0, cad.faltando.join(", "));
ok("leu 200+ pessoas", cad.pessoas.length > 200, String(cad.pessoas.length));
ok("so a linha RECARGA fica sem CPF", cad.semCpf === 1, `${cad.semCpf} sem CPF`);
ok("todo CPF lido e valido", cad.pessoas.every((p) => !p.cpf || cpfValido(p.cpf)));
ok("todos marcados como motorista", cad.pessoas.every((p) => p.tipo === "motorista"));

// --- Cadastro de ajudantes (01.20.01.48) ---
// Arquivo separado de proposito: os codigos COLIDEM com os do cadastro de
// motoristas (120 numeros sao pessoas diferentes nos dois), entao usar um
// so atribuiria a nota a quem nao entregou.
const cadAj = lerCadastroPessoas(await texto(arqAjudantes[0].id), "ajudante");
console.log(`  cadastro 48: ${cadAj.pessoas.length} pessoas, ${cadAj.semCpf} sem CPF utilizavel`);
ok('achou as colunas (o 48 escreve "Nome Ajudante", nao "Nome")',
  cadAj.faltando.length === 0, cadAj.faltando.join(", "));
ok("leu 100+ ajudantes", cadAj.pessoas.length > 100, String(cadAj.pessoas.length));
ok("todo CPF lido e valido", cadAj.pessoas.every((p) => !p.cpf || cpfValido(p.cpf)));
ok("todos marcados como ajudante", cadAj.pessoas.every((p) => p.tipo === "ajudante"));

// A colisao e real -- este teste falha se algum dia os cadastros se
// unificarem, e ai a chave composta pode ser revista.
const nomeMotPorCod = new Map(cad.pessoas.map((p) => [p.codigo, p.nome]));
const colidem = cadAj.pessoas.filter((p) => {
  const outro = nomeMotPorCod.get(p.codigo);
  return outro && outro.slice(0, 12) !== p.nome.slice(0, 12);
}).length;
console.log(`  codigos que sao pessoas diferentes nos dois cadastros: ${colidem}`);
ok("a colisao entre os cadastros existe (por isso a chave tem o tipo)", colidem > 50, String(colidem));

// --- Viagens (03.11.29) ---
const via = lerViagens(await texto(arqViagens[0].id));
console.log(`  viagens 03.11.29: ${via.viagens.length} mapas`);
ok("achou as colunas", via.faltando.length === 0, via.faltando.join(", "));
ok("leu 3000+ mapas", via.viagens.length > 3000, String(via.viagens.length));
ok("todo mapa esta normalizado (sem zero a esquerda)", via.viagens.every((v) => !/^0/.test(v.mapa)));
// 842 dos 3.651 mapas vem sem placa, sem motorista e sem ajudante -- sao
// mapas que existiram no relatorio mas nao tiveram tripulacao lancada.
// Nao e erro de leitura, e nao atrapalha: conferido nos 8 meses, esses
// mapas praticamente nao recebem avaliacao (so 18 das 14.211). O que
// vale medir e a atribuicao das AVALIACOES, mais abaixo.
ok("a maioria das viagens tem motorista", via.viagens.filter((v) => v.motoristaCodigo).length > 2500);
const comData = via.viagens.filter((v) => v.data);
ok("as datas viraram ISO", comData.length > 3000 && comData.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.data)));

// --- Avaliacoes (LOG.CO) ---
ok("achou as planilhas do LOG.CO", arqLogCo.length > 0, `${arqLogCo.length} arquivo(s)`);

const valorDaCelula = (c) => {
  let v = c.value;
  if (v && typeof v === "object" && "richText" in v) v = v.richText.map((p) => p.text).join("");
  if (v && typeof v === "object" && "text" in v) v = v.text;
  if (v && typeof v === "object" && "result" in v) v = v.result;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v === null || v === undefined ? "" : String(v).trim();
};

let todas = [];
let totalIgnoradas = 0;
for (const arquivo of arqLogCo) {
  const b = await bytes(arquivo.id);
  if (!b) { ok(`${arquivo.nome} baixou`, false); continue; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(b);
  const ws = wb.worksheets[0];
  const cab = [];
  for (let i = 1; i <= ws.columnCount; i++) cab.push(valorDaCelula(ws.getRow(1).getCell(i)));
  const linhas = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const o = {};
    for (let i = 1; i <= ws.columnCount; i++) if (cab[i - 1]) o[cab[i - 1]] = valorDaCelula(ws.getRow(n).getCell(i));
    linhas.push(o);
  }
  const { avaliacoes, ignoradas } = lerAvaliacoes(linhas);
  todas = todas.concat(avaliacoes);
  totalIgnoradas += ignoradas;
}
console.log(`  LOG.CO: ${todas.length} avaliacoes lidas, ${totalIgnoradas} ignoradas`);
ok("leu 14 mil avaliacoes", todas.length > 14000, String(todas.length));
ok("nota sempre de 1 a 5", todas.every((a) => a.nota >= 1 && a.nota <= 5));
ok("data sempre ISO", todas.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.dataAvaliacao)));
ok('"N/A" virou ausencia de motivo', todas.every((a) => a.motivo !== "N/A"));
ok('pedido perdeu o ".0" do Excel', todas.every((a) => !a.pedido || !a.pedido.endsWith(".0")));
ok("classificacao do arquivo bate com a da nota",
  todas.every((a) => a.classificacao === classificacaoDaNota(a.nota)),
  "se falhar, o LOG.CO mudou a regua");

// --- O cruzamento ---
// Achar o mapa nao basta -- o que interessa e chegar numa PESSOA.
const porMapa = new Map(via.viagens.map((v) => [v.mapa, v]));
const comMotorista = todas.filter((a) => porMapa.get(a.mapa)?.motoristaCodigo);
const comAjudante = todas.filter((a) => porMapa.get(a.mapa)?.ajudante1Codigo);
const pctMot = (comMotorista.length / todas.length) * 100;
const pctAj = (comAjudante.length / todas.length) * 100;
console.log(`  chegam a um motorista: ${comMotorista.length}/${todas.length} (${pctMot.toFixed(1)}%)`);
console.log(`  chegam a um ajudante : ${comAjudante.length}/${todas.length} (${pctAj.toFixed(1)}%)`);
ok("atribuicao ao motorista acima de 98%", pctMot > 98, `${pctMot.toFixed(1)}%`);
ok("atribuicao ao ajudante acima de 90%", pctAj > 90, `${pctAj.toFixed(1)}%`);

// As que pedem feedback sao as que nao podem ficar orfas.
const ruinsTodas = todas.filter((a) => precisaFeedback(a.nota));
const ruinsComDono = ruinsTodas.filter((a) => porMapa.get(a.mapa)?.motoristaCodigo);
const pctRuins = (ruinsComDono.length / ruinsTodas.length) * 100;
console.log(`  das ${ruinsTodas.length} abaixo da meta, ${ruinsComDono.length} tem dono (${pctRuins.toFixed(1)}%)`);
ok("avaliacao ruim quase sempre tem dono", pctRuins > 98, `${pctRuins.toFixed(1)}%`);

const resumo = resumirRating(todas);
console.log(`\n  media geral: ${resumo.media} | estrelas: ${resumo.estrelas}`);
console.log(`  promotores ${resumo.promotores} | neutros ${resumo.neutros} | detratores ${resumo.detratores}`);
console.log(`  abaixo da meta: ${resumo.abaixoDaMeta} (${resumo.pctAbaixoDaMeta}%)`);
ok("o resumo fecha com o total", resumo.promotores + resumo.neutros + resumo.detratores === todas.length);
ok("abaixo da meta = neutros + detratores", resumo.abaixoDaMeta === resumo.neutros + resumo.detratores);

console.log("\n  motivos das avaliacoes abaixo de 5:");
for (const m of motivosMaisComuns(todas.filter((a) => precisaFeedback(a.nota))))
  console.log(`    ${String(m.total).padStart(4)}  ${m.motivo}`);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
