/**
 * Re-carimba o cache dos arquivos que JA estao no bucket "conteudo".
 *
 * O `cacheControl` dos uploads foi corrigido no codigo (ver lib/storage),
 * mas isso so vale para arquivo novo: o que ja estava gravado continua
 * respondendo `Cache-Control: no-cache`, e portanto continua sendo
 * rebaixado inteiro a cada abertura de tela.
 *
 * O Supabase nao tem endpoint para trocar so o metadado, entao o jeito e
 * reenviar o arquivo por cima de si mesmo, agora com o cabecalho certo.
 * Os bytes sao os mesmos -- o que muda e o cabecalho que o CDN passa a
 * mandar junto.
 *
 * Rodar de novo nao faz mal: quem ja esta com o cache longo e pulado.
 *
 *   node scripts/recachear-storage.mjs           confere e mostra o que falta
 *   node scripts/recachear-storage.mjs --aplicar reenvia de fato
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "conteudo";
const SEGUNDOS = "31536000";

/** Quantos arquivos viajam ao mesmo tempo. Alto demais e o Supabase corta. */
const SIMULTANEOS = 4;

const aplicar = process.argv.includes("--aplicar");

/* ---- Credenciais, do mesmo .env.local que o app usa ---------------- */

const env = Object.fromEntries(
  readFileSync(join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !CHAVE) {
  console.error("Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

/* ---- Percorre o bucket inteiro ------------------------------------- */

async function listar(prefixo) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...cabecalhos, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: prefixo, limit: 1000 }),
  });
  if (!r.ok) throw new Error(`list ${prefixo}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function todosOsArquivos() {
  const fila = [""];
  const arquivos = [];

  while (fila.length > 0) {
    const prefixo = fila.shift();
    for (const item of await listar(prefixo)) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      // Pasta vem sem id; arquivo vem com id e metadata.
      if (!item.id) fila.push(caminho);
      else arquivos.push({ caminho, bytes: item.metadata?.size ?? 0 });
    }
  }

  return arquivos;
}

/* ---- Conferir e corrigir um arquivo -------------------------------- */

const publica = (caminho) =>
  `${URL_BASE}/storage/v1/object/public/${BUCKET}/${caminho.split("/").map(encodeURIComponent).join("/")}`;

async function cacheAtual(caminho) {
  const r = await fetch(publica(caminho), { method: "HEAD" });
  return r.headers.get("cache-control") ?? "(sem cabecalho)";
}

async function recachear(caminho) {
  const baixado = await fetch(publica(caminho));
  if (!baixado.ok) throw new Error(`download ${baixado.status}`);

  const tipo = baixado.headers.get("content-type") || "application/octet-stream";
  const corpo = Buffer.from(await baixado.arrayBuffer());

  // x-upsert grava por cima do mesmo caminho. Como os bytes sao os
  // mesmos, o unico efeito e o cabecalho novo.
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: {
      ...cabecalhos,
      "Content-Type": tipo,
      "Cache-Control": `max-age=${SEGUNDOS}`,
      "x-upsert": "true",
    },
    body: corpo,
  });

  if (!r.ok) throw new Error(`upload ${r.status} ${await r.text()}`);
}

/* ---- Roda em lotes -------------------------------------------------- */

async function emLotes(itens, tamanho, tarefa) {
  const resultados = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = itens.slice(i, i + tamanho);
    resultados.push(...(await Promise.all(lote.map(tarefa))));
  }
  return resultados;
}

const arquivos = await todosOsArquivos();
const totalMb = (arquivos.reduce((s, a) => s + a.bytes, 0) / 1024 / 1024).toFixed(1);
console.log(`${arquivos.length} arquivos no bucket, ${totalMb} MB no total\n`);

const estado = await emLotes(arquivos, SIMULTANEOS, async (a) => ({
  ...a,
  cache: await cacheAtual(a.caminho),
}));

const semCache = estado.filter((a) => !/max-age=\d{5,}/.test(a.cache));

console.log(`ja com cache longo: ${estado.length - semCache.length}`);
console.log(`precisam corrigir:  ${semCache.length}\n`);

if (semCache.length === 0) {
  console.log("Nada a fazer.");
  process.exit(0);
}

if (!aplicar) {
  for (const a of semCache.slice(0, 10)) {
    console.log(`  ${a.cache.padEnd(22)} ${a.caminho}`);
  }
  if (semCache.length > 10) console.log(`  ... e mais ${semCache.length - 10}`);
  console.log("\nRode de novo com --aplicar para corrigir.");
  process.exit(0);
}

let feitos = 0;
const falhas = [];

await emLotes(semCache, SIMULTANEOS, async (a) => {
  try {
    await recachear(a.caminho);
    feitos++;
    if (feitos % 10 === 0) console.log(`  ${feitos}/${semCache.length}...`);
  } catch (e) {
    falhas.push(`${a.caminho}: ${e.message}`);
  }
});

console.log(`\ncorrigidos: ${feitos}`);
if (falhas.length > 0) {
  console.log(`falharam:   ${falhas.length}`);
  for (const f of falhas) console.log(`  ${f}`);
}

// Conferencia final: o cabecalho mudou mesmo?
const amostra = semCache.slice(0, 3);
console.log("\nconferencia:");
for (const a of amostra) {
  console.log(`  ${(await cacheAtual(a.caminho)).padEnd(34)} ${a.caminho}`);
}
