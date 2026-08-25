import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const CSV_PATH = "C:\\Users\\Usuário\\Downloads\\r_PW01084C_Maycon_19331465.csv";
const REVENDA_SLUG = process.argv[2] || "barreiras";
const LOTE = 1000;

function lerEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  const texto = fs.readFileSync(p, "utf8");
  const mapa = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) mapa[m[1]] = m[2].trim();
  }
  return mapa;
}

const env = lerEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Não achei NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// O export do SAP vem em Windows-1252/Latin1, não UTF-8 -- lido como UTF-8
// os acentos viram "�". "latin1" no Node decodifica 1 byte = 1 char, que
// bate com Windows-1252 na faixa usada por acentuação em português.
const bruto = fs.readFileSync(CSV_PATH, "latin1");
const linhas = bruto.split(/\r?\n/);

console.log(`Linhas no arquivo: ${linhas.length}`);

const porCodigo = new Map();
for (let i = 1; i < linhas.length; i++) {
  const linha = linhas[i];
  if (!linha.trim()) continue;
  const campos = linha.split(";");
  const codigo = (campos[0] ?? "").trim();
  const descricao = (campos[1] ?? "").trim();
  if (!codigo || !descricao) continue;
  porCodigo.set(codigo, descricao);
}

console.log(`Produtos únicos: ${porCodigo.size}`);

const { data: revenda, error: erroRevenda } = await supabase
  .from("revendas")
  .select("id, nome")
  .eq("slug", REVENDA_SLUG)
  .single();

if (erroRevenda || !revenda) {
  console.error(`Não achei a revenda "${REVENDA_SLUG}": ${erroRevenda?.message}`);
  process.exit(1);
}
console.log(`Importando para: ${revenda.nome}`);

const linhasParaGravar = [...porCodigo.entries()].map(([codigo, descricao]) => ({
  revenda_id: revenda.id,
  codigo,
  descricao,
}));

let importados = 0;
for (let i = 0; i < linhasParaGravar.length; i += LOTE) {
  const lote = linhasParaGravar.slice(i, i + LOTE);
  const { error } = await supabase.from("pa_produtos").upsert(lote, { onConflict: "revenda_id,codigo" });
  if (error) {
    console.error(`Falha no lote ${i}-${i + lote.length}: ${error.message}`);
    process.exit(1);
  }
  importados += lote.length;
  console.log(`Importados ${importados}/${linhasParaGravar.length}`);
}

console.log(`\nConcluído: ${importados} produtos em pa_produtos para ${revenda.nome}.`);
