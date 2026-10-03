// Gera src/lib/saude-catalogo.json a partir de supabase/migrations.
//   npx tsx scripts/gerar-catalogo-saude.mjs
//
// Rode depois de criar uma migration nova -- o teste saude-sistema.teste.mjs
// (e o GitHub, a cada PR) reprova enquanto o catálogo estiver velho.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogoDasMigrations } from "../src/lib/saude-sistema.ts";

const pasta = "supabase/migrations";
const arquivos = readdirSync(pasta)
  .filter((n) => n.endsWith(".sql"))
  .map((nome) => ({ nome, sql: readFileSync(join(pasta, nome), "utf8") }));
const catalogo = catalogoDasMigrations(arquivos);
writeFileSync("src/lib/saude-catalogo.json", JSON.stringify(catalogo, null, 1) + "\n");
console.log(`${Object.keys(catalogo.tabelas).length} tabelas e ${catalogo.colunas.length} colunas no catálogo.`);
