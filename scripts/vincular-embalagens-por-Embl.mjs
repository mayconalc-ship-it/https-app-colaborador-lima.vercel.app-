import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const CURADA_PATH = "C:\\Users\\Usuário\\Downloads\\Códigos de produto.csv";

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

// ---- 1) Lê a planilha curada: código -> nome de embalagem (coluna Embl)
// As 11 linhas com campo deslocado (ver scripts/importar-produtos-reepack.mjs)
// não têm Embl recuperável -- ficam de fora, sem problema, já foram
// cadastradas sem embalagem automática da vez passada.
const brutoCurada = fs.readFileSync(CURADA_PATH, "latin1");
const linhasCurada = brutoCurada.split(/\r?\n/);
const embalagemPorCodigo = new Map();
for (let i = 1; i < linhasCurada.length; i++) {
  const linha = linhasCurada[i];
  if (!linha.trim()) continue;
  const c = linha.split(";");
  const codigo = (c[0] ?? "").trim();
  const descricao = (c[3] ?? "").trim();
  const embl = (c[7] ?? "").trim();
  if (!codigo || !descricao || !embl) continue;
  if (/^\d+([.,]\d+)?$/.test(descricao)) continue; // linha deslocada, pula
  embalagemPorCodigo.set(codigo, embl);
}
console.log(`Códigos com embalagem (Embl) na planilha: ${embalagemPorCodigo.size}`);

const nomesEmbalagem = [...new Set(embalagemPorCodigo.values())].sort();
console.log(`Tipos de embalagem distintos: ${nomesEmbalagem.length}`);

// ---- 2) Garante que cada embalagem exista nas duas revendas (cria só as que faltam)
const { data: revendas } = await admin.from("revendas").select("id, nome").eq("ativa", true);

const embalagemIdPorRevendaENome = new Map(); // `${revendaId}::${nomeLower}` -> id

for (const revenda of revendas ?? []) {
  const { data: existentes } = await admin
    .from("pa_embalagens")
    .select("id, nome")
    .eq("revenda_id", revenda.id);

  for (const e of existentes ?? []) {
    embalagemIdPorRevendaENome.set(`${revenda.id}::${e.nome.toLowerCase()}`, e.id);
  }

  const faltando = nomesEmbalagem.filter(
    (nome) => !embalagemIdPorRevendaENome.has(`${revenda.id}::${nome.toLowerCase()}`),
  );

  if (faltando.length > 0) {
    const { data: criadas, error } = await admin
      .from("pa_embalagens")
      .insert(faltando.map((nome) => ({ revenda_id: revenda.id, nome })))
      .select("id, nome");
    if (error) {
      console.error(`Falha ao criar embalagens em ${revenda.nome}: ${error.message}`);
      process.exit(1);
    }
    for (const e of criadas) {
      embalagemIdPorRevendaENome.set(`${revenda.id}::${e.nome.toLowerCase()}`, e.id);
    }
    console.log(`${revenda.nome}: ${criadas.length} embalagem(ns) nova(s) criada(s).`);
  } else {
    console.log(`${revenda.nome}: nenhuma embalagem nova precisa ser criada.`);
  }
}

// ---- 3) Vincula cada produto SEM embalagem ainda -- não mexe em quem já
//      foi vinculado manualmente antes.
for (const revenda of revendas ?? []) {
  const { data: pendentes } = await admin
    .from("pa_produtos")
    .select("id, codigo")
    .eq("revenda_id", revenda.id)
    .not("fator_hecto", "is", null)
    .is("embalagem_id", null);

  let vinculados = 0;
  let semEmbl = 0;
  for (const p of pendentes ?? []) {
    const nomeEmbl = embalagemPorCodigo.get(p.codigo);
    if (!nomeEmbl) {
      semEmbl++;
      continue;
    }
    const embalagemId = embalagemIdPorRevendaENome.get(`${revenda.id}::${nomeEmbl.toLowerCase()}`);
    if (!embalagemId) {
      semEmbl++;
      continue;
    }
    const { error } = await admin
      .from("pa_produtos")
      .update({ embalagem_id: embalagemId })
      .eq("id", p.id);
    if (error) {
      console.error(`Falha ao vincular produto ${p.codigo}: ${error.message}`);
      continue;
    }
    vinculados++;
  }
  console.log(`${revenda.nome}: ${vinculados} produto(s) vinculado(s) agora, ${semEmbl} sem Embl na planilha (ficam pendentes).`);
}

console.log("\nConcluído.");
