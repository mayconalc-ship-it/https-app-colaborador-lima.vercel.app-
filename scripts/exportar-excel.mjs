/**
 * Exporta as tabelas do Supabase para um arquivo Excel (.xlsx), uma aba por tabela.
 *
 * Como rodar (na pasta do projeto):
 *   node scripts/exportar-excel.mjs
 *
 * Gera "exportacao-AAAA-MM-DD.xlsx" na raiz do projeto.
 * As credenciais sao lidas do .env.local automaticamente.
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, "..");

// Le o .env.local sem precisar de biblioteca extra.
const env = {};
for (const linha of fs
  .readFileSync(path.join(raiz, ".env.local"), "utf-8")
  .split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Tabelas a exportar. Comente as linhas que nao interessarem.
const TABELAS = [
  "profiles",
  "feedback_rota",
  "comunicados",
  "padroes",
  "ranking_matinal",
  "sonho_revenda",
  "escala_trabalho",
  "menu_itens",
];

const livro = new ExcelJS.Workbook();

for (const tabela of TABELAS) {
  const { data, error } = await supabase.from(tabela).select("*");

  if (error) {
    console.log(`  x ${tabela}: ${error.message}`);
    continue;
  }
  if (!data?.length) {
    console.log(`  - ${tabela}: vazia, pulando`);
    continue;
  }

  const aba = livro.addWorksheet(tabela);
  const colunas = Object.keys(data[0]);

  aba.columns = colunas.map((c) => ({
    header: c,
    key: c,
    width: Math.min(Math.max(c.length + 4, 14), 45),
  }));
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: "frozen", ySplit: 1 }];

  for (const registro of data) {
    const linha = {};
    for (const coluna of colunas) {
      const valor = registro[coluna];
      // Listas (ex.: ocorrencias) e objetos viram texto legivel na celula.
      linha[coluna] = Array.isArray(valor)
        ? valor.join(", ")
        : valor !== null && typeof valor === "object"
          ? JSON.stringify(valor)
          : valor;
    }
    aba.addRow(linha);
  }

  aba.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: colunas.length },
  };

  console.log(`  OK ${tabela}: ${data.length} registros`);
}

const nomeArquivo = `exportacao-${new Date().toISOString().slice(0, 10)}.xlsx`;
await livro.xlsx.writeFile(path.join(raiz, nomeArquivo));
console.log(`\nPronto: ${nomeArquivo}`);
