import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const MODULOS = [
  "comunicados", "ranking", "padroes", "sonho", "rotas",
  "escala", "rv", "quiz", "feedbacks", "produtividade-armazem",
];
const LOTE = 1000;

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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) todo vinculo pessoa <-> revenda
const vinculos = [];
{
  let de = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("colaborador_revendas")
      .select("colaborador_id, revenda_id")
      .range(de, de + LOTE - 1);
    if (error) throw error;
    vinculos.push(...data);
    if (data.length < LOTE) break;
    de += LOTE;
  }
}
console.log(`Vínculos pessoa-revenda: ${vinculos.length}`);

// 2) modulos ativos por revenda, só os da lista
const { data: modulosAtivos, error: erroModulos } = await supabase
  .from("revenda_modulos")
  .select("revenda_id, modulo")
  .eq("ativo", true)
  .in("modulo", MODULOS);
if (erroModulos) throw erroModulos;
console.log(`Linhas revenda_modulos relevantes: ${modulosAtivos.length}`);

const modulosPorRevenda = new Map();
for (const m of modulosAtivos) {
  const lista = modulosPorRevenda.get(m.revenda_id) ?? [];
  lista.push(m.modulo);
  modulosPorRevenda.set(m.revenda_id, lista);
}

// 3) cross join: pra cada vinculo, cada modulo que a revenda dele tem ativo
const linhas = [];
for (const v of vinculos) {
  const modulos = modulosPorRevenda.get(v.revenda_id) ?? [];
  for (const modulo of modulos) {
    linhas.push({ colaborador_id: v.colaborador_id, revenda_id: v.revenda_id, modulo });
  }
}
console.log(`Concessões a gravar (herança): ${linhas.length}`);

let gravadas = 0;
for (let i = 0; i < linhas.length; i += LOTE) {
  const lote = linhas.slice(i, i + LOTE);
  const { error } = await supabase
    .from("colaborador_modulos_extra")
    .upsert(lote, { onConflict: "colaborador_id,revenda_id,modulo", ignoreDuplicates: true });
  if (error) {
    console.error(`Falha no lote ${i}-${i + lote.length}: ${error.message}`);
    process.exit(1);
  }
  gravadas += lote.length;
  console.log(`Processadas ${gravadas}/${linhas.length}`);
}

console.log(`\nConcluído: herança aplicada para ${vinculos.length} vínculos, ${MODULOS.length} módulos.`);
