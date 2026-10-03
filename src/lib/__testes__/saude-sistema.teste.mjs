// Saúde do sistema: o catálogo das migrations e a leitura dos erros.
//   npx tsx src/lib/__testes__/saude-sistema.teste.mjs
import { readdirSync, readFileSync } from "node:fs";
import { catalogoDasMigrations, faltasPorMigration, tipoDoErro } from "../saude-sistema.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}

console.log("== LEITURA DAS MIGRATIONS ==");
const c = catalogoDasMigrations([
  { nome: "002_b.sql", sql: "alter table public.a add column if not exists nova text, add column outra int;\nalter table public.a drop column velha;" },
  {
    nome: "001_a.sql",
    sql: "-- create table public.so_no_comentario (id int);\ncreate table if not exists public.a (id uuid, velha text);\nalter table a add column velha text;\ncreate table b (id int);",
  },
  { nome: "003_c.sql", sql: "drop table if exists public.b cascade;\nalter table public.comunicados add column destaque boolean;" },
  {
    nome: "004_d.sql",
    sql: "do $$ begin if exists (select 1) then alter table public.a rename column nova to renomeada; end if; end $$;",
  },
]);
ok("tabela criada entra com o número da migration", c.tabelas.a === "001");
ok("comentário não cria tabela", !("so_no_comentario" in c.tabelas));
ok("lidas na ordem do nome, não do array", c.colunas.some((x) => x.coluna === "outra" && x.migration === "002"));
ok("coluna renomeada: o nome velho sai", !c.colunas.some((x) => x.coluna === "nova"));
ok("coluna renomeada: o novo entra com a migration do rename", c.colunas.some((x) => x.coluna === "renomeada" && x.migration === "004"));
ok("duas colunas no mesmo alter", c.colunas.some((x) => x.coluna === "outra"));
ok("coluna apagada sai", !c.colunas.some((x) => x.coluna === "velha"));
ok("tabela apagada sai", !("b" in c.tabelas));
ok("coluna em tabela criada fora das migrations conta", c.colunas.some((x) => x.tabela === "comunicados" && x.coluna === "destaque"));

console.log("== ERROS DO BANCO ==");
ok("tabela que falta (PostgREST)", tipoDoErro({ code: "PGRST205", message: "Could not find the table 'public.x'" }) === "tabela");
ok("tabela que falta (Postgres)", tipoDoErro({ code: "42P01", message: 'relation "x" does not exist' }) === "tabela");
ok("coluna que falta", tipoDoErro({ code: "42703", message: "column x.y does not exist" }) === "coluna");
ok("sem erro", tipoDoErro(null) === "ok");
ok("outro erro", tipoDoErro({ code: "500", message: "timeout" }) === "outro");

console.log("== FALTAS NA ORDEM DE RODAR ==");
const g = faltasPorMigration([
  { tipo: "coluna", tabela: "x", coluna: "y", migration: "159" },
  { tipo: "tabela", tabela: "z", migration: "99" },
  { tipo: "tabela", tabela: "w", migration: "159" },
]);
ok("da mais antiga à mais nova (99 antes de 159)", g.map((x) => x.migration).join() === "99,159");
ok("agrupadas", g[1].faltas.length === 2);

console.log("== O CATÁLOGO GRAVADO ESTÁ EM DIA ==");
const pasta = new URL("../../../supabase/migrations/", import.meta.url);
const arquivos = readdirSync(pasta)
  .filter((n) => n.endsWith(".sql"))
  .map((nome) => ({ nome, sql: readFileSync(new URL(nome, pasta), "utf8") }));
const gravado = JSON.parse(readFileSync(new URL("../saude-catalogo.json", import.meta.url), "utf8"));
const atual = catalogoDasMigrations(arquivos);
ok(
  "saude-catalogo.json bate com as migrations (senão: npx tsx scripts/gerar-catalogo-saude.mjs)",
  JSON.stringify(gravado) === JSON.stringify(atual),
);
ok("as tabelas da 157 estão lá", atual.tabelas.manut_fornecedores === "157" && atual.tabelas.manut_raci_celulas === "157");
ok(
  "bate palete: unidade (088) virou unidade_avariada (092)",
  !atual.colunas.some((x) => x.tabela === "pa_bate_palete_itens" && x.coluna === "unidade") &&
    atual.colunas.some((x) => x.tabela === "pa_bate_palete_itens" && x.coluna === "unidade_avariada"),
);
ok("tirar do tempo real (alter publication ... drop table) não apaga a tabela", atual.tabelas.eventos_acesso === "012");
ok("a coluna da 159 está lá", atual.colunas.some((x) => x.tabela === "pa_relatos_anomalia" && x.coluna === "atendimento_id" && x.migration === "159"));

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
