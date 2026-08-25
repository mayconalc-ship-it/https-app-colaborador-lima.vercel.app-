import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const CURADA_PATH = "C:\\Users\\Usuário\\Downloads\\Códigos de produto.csv";
const BASE_PATH = "C:\\Users\\Usuário\\Downloads\\r_PW01084C_Maycon_19331465.csv";

function lerEnvLocal() {
  const texto = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const mapa = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) mapa[m[1]] = m[2].trim();
  }
  return mapa;
}

const env = lerEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function semZerosEsquerda(s) {
  const limpo = (s ?? "").trim().replace(/^0+/, "");
  return limpo === "" ? "0" : limpo;
}

function paraNumero(s) {
  const limpo = (s ?? "").trim().replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// ---- 1) Base grande (SAP): mapa prod_sap -> {unidadesPorCaixa, fatorHecto}
const brutoBase = fs.readFileSync(BASE_PATH, "latin1");
const linhasBase = brutoBase.split(/\r?\n/);
const porProdSap = new Map();
for (let i = 1; i < linhasBase.length; i++) {
  const linha = linhasBase[i];
  if (!linha.trim()) continue;
  const c = linha.split(";");
  const prodSap = semZerosEsquerda(c[38]);
  if (!prodSap || prodSap === "0") continue;
  const unidadesPorCaixa = paraNumero(c[13]);
  const fatorHecto = paraNumero(c[14]);
  if (unidadesPorCaixa === null || fatorHecto === null) continue;
  porProdSap.set(prodSap, { unidadesPorCaixa, fatorHecto });
}
console.log(`Base SAP: ${porProdSap.size} produtos com Fator/Fator Hecto válidos.`);

// ---- 2) Lista curada: PROMAX (código) + PRODUTO (descrição) + PROD_SAP (chave de busca)
const brutoCurada = fs.readFileSync(CURADA_PATH, "latin1");
const linhasCurada = brutoCurada.split(/\r?\n/);
const porCodigo = new Map();
let duplicados = 0;
for (let i = 1; i < linhasCurada.length; i++) {
  const linha = linhasCurada[i];
  if (!linha.trim()) continue;
  const c = linha.split(";");
  const codigo = (c[0] ?? "").trim();
  const prodSap = semZerosEsquerda(c[2]);
  const descricao = (c[3] ?? "").trim();
  if (!codigo || !descricao) continue;

  // Algumas linhas da planilha vieram com os campos deslocados (a
  // descrição virou um numero puro, tipo "38949") -- sinal de corrupcao
  // na origem, nao vale cadastrar.
  if (/^\d+([.,]\d+)?$/.test(descricao)) {
    console.log(`Ignorando linha corrompida: código "${codigo}" com descrição "${descricao}" (não parece nome de produto).`);
    continue;
  }

  const fator = porProdSap.get(prodSap);
  if (porCodigo.has(codigo)) duplicados++;

  porCodigo.set(codigo, {
    codigo,
    descricao,
    unidades_por_caixa: fator?.unidadesPorCaixa ?? null,
    fator_hecto: fator?.fatorHecto ?? null,
  });
}
const produtos = [...porCodigo.values()];
const semMatch = produtos.filter((p) => p.fator_hecto === null).length;
console.log(`Lista curada: ${produtos.length} produtos únicos (${duplicados} código(s) repetido(s) na planilha, mantida a última linha), ${semMatch} sem Fator Hecto encontrado na base (vão precisar de ajuste manual).`);

// ---- 3) Grava nas duas revendas
const { data: revendas } = await admin.from("revendas").select("id, slug, nome").eq("ativa", true);
for (const revenda of revendas ?? []) {
  const linhas = produtos.map((p) => ({ revenda_id: revenda.id, ...p }));
  const { error } = await admin
    .from("pa_produtos")
    .upsert(linhas, { onConflict: "revenda_id,codigo" });
  if (error) {
    console.error(`Falha ao gravar em ${revenda.nome}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${revenda.nome}: ${linhas.length} produtos gravados/atualizados.`);
}

console.log(`\nConcluído. ${produtos.length - semMatch} produtos com Fator Hecto pronto, ${semMatch} precisam de conferência manual (código não bateu com a base SAP).`);
if (semMatch > 0) {
  console.log("\nCódigos sem match:");
  for (const p of produtos.filter((p) => p.fator_hecto === null)) {
    console.log(`  ${p.codigo} — ${p.descricao}`);
  }
}
