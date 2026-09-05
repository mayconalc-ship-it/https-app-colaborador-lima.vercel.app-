/**
 * A IDA E A VOLTA: gera a planilha do jeito que a rota exporta e le com
 * a MESMA logica do importador. Se alguma coluna nao for reconhecida, ou
 * um valor voltar diferente, aparece aqui e nao no cadastro do dono.
 */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COLUNAS = [
  "PROMAX", "PRODUTO", "Cluster Produto", "Fator Hecto", "Caixas Pallet",
  "CAIXAS LASTRO", "Un/CX", "Tipo", "EMBALAGEM_Repack", "EMBALAGEM_DESPEJO",
  "META_(cx)REPACK/H", "META_(l)DESPEJO/H",
];

const revendas = (await db.from("revendas").select("id, nome").order("ordem")).data;
const rev = revendas[0];
const { data: produtos } = await db
  .from("pa_produtos")
  .select("codigo, descricao, cluster_produto, fator_hecto, caixas_pallet, caixas_por_lastro, unidades_por_caixa, tipo, embalagem_id, meta_reepack_hora, meta_despejo_hora")
  .eq("revenda_id", rev.id)
  .order("descricao");
const { data: emb } = await db.from("pa_embalagens").select("id, nome").eq("revenda_id", rev.id);
const nomeEmb = new Map(emb.map((e) => [e.id, e.nome]));

const wb = new ExcelJS.Workbook();
const aba = wb.addWorksheet("Relacao_Prod_App_Colaborador");
aba.addRow(COLUNAS);
for (const p of produtos) {
  aba.addRow([
    p.codigo, p.descricao, p.cluster_produto ?? "", p.fator_hecto ?? "",
    p.caixas_pallet ?? "", p.caixas_por_lastro ?? "", p.unidades_por_caixa ?? "",
    p.tipo ?? "", p.embalagem_id ? (nomeEmb.get(p.embalagem_id) ?? "") : "", "",
    p.meta_reepack_hora ?? "", p.meta_despejo_hora ?? "",
  ]);
}
const buffer = await wb.xlsx.writeBuffer();

// ---- agora LE como o importador ----
const normalizar = (t) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const celulaTexto = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return String(v);
  }
  return String(v);
};
const celulaNumero = (v) => {
  const t = celulaTexto(v).replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const celulaContagem = (v) => {
  const n = celulaNumero(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
};

const lido = new ExcelJS.Workbook();
await lido.xlsx.load(buffer);
const a2 = lido.worksheets[0];
const mapa = new Map();
a2.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
  const k = normalizar(celulaTexto(c.value));
  if (k) mapa.set(k, i);
});
const col = (...nomes) => { for (const n of nomes) { const c = mapa.get(n); if (c) return c; } return null; };

const procuradas = {
  codigo: ["PROMAX"], descricao: ["PRODUTO"], cluster: ["CLUSTER PRODUTO"],
  hecto: ["FATOR HECTO"], pallet: ["CAIXAS PALLET"], uncx: ["UN/CX", "UN CX"],
  lastro: ["CAIXAS LASTRO", "CAIXAS_LASTRO", "CX/LASTRO", "CX LASTRO", "LASTRO"],
  tipo: ["TIPO"], repack: ["EMBALAGEM_REPACK", "EMBALAGEM REPACK", "EMBALAGEM"],
  despejo: ["EMBALAGEM_DESPEJO", "EMBALAGEM DESPEJO"],
  metaR: ["META_(CX)REPACK/H", "META (CX)REPACK/H", "META (CX) REPACK/H"],
  metaD: ["META_(L)DESPEJO/H", "META (L)DESPEJO/H", "META (L) DESPEJO/H"],
};
const cols = {};
let faltou = 0;
for (const [k, nomes] of Object.entries(procuradas)) {
  cols[k] = col(...nomes);
  if (!cols[k]) { console.log(`  NAO ACHOU a coluna de ${k}`); faltou++; }
}
console.log(`colunas reconhecidas: ${Object.keys(procuradas).length - faltou}/${Object.keys(procuradas).length}`);

const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));
let linhas = 0, divergencias = 0;
a2.eachRow({ includeEmpty: false }, (row, n) => {
  if (n === 1) return;
  const codigo = celulaTexto(row.getCell(cols.codigo).value).trim();
  const p = porCodigo.get(codigo);
  if (!p) { console.log(`  linha ${n}: codigo ${codigo} nao existe no banco`); divergencias++; return; }
  linhas++;
  const conferir = (rotulo, obtido, esperado) => {
    const a = obtido === null || obtido === "" ? null : obtido;
    const b = esperado === null || esperado === "" ? null : esperado;
    if (String(a) !== String(b)) {
      console.log(`  ${codigo} ${rotulo}: voltou ${JSON.stringify(a)}, banco tem ${JSON.stringify(b)}`);
      divergencias++;
    }
  };
  conferir("descricao", celulaTexto(row.getCell(cols.descricao).value).trim(), p.descricao);
  conferir("cluster", celulaTexto(row.getCell(cols.cluster).value).trim(), p.cluster_produto);
  conferir("fator_hecto", celulaNumero(row.getCell(cols.hecto).value), p.fator_hecto);
  conferir("caixas_pallet", celulaContagem(row.getCell(cols.pallet).value), p.caixas_pallet);
  conferir("caixas_por_lastro", celulaContagem(row.getCell(cols.lastro).value), p.caixas_por_lastro);
  conferir("unidades_por_caixa", celulaContagem(row.getCell(cols.uncx).value), p.unidades_por_caixa);
  conferir("tipo", celulaTexto(row.getCell(cols.tipo).value).trim(), p.tipo);
  conferir("meta_reepack", celulaNumero(row.getCell(cols.metaR).value), p.meta_reepack_hora);
  conferir("meta_despejo", celulaNumero(row.getCell(cols.metaD).value), p.meta_despejo_hora);
  const embNome = celulaTexto(row.getCell(cols.repack).value).trim();
  const esperadoEmb = p.embalagem_id ? nomeEmb.get(p.embalagem_id) : null;
  conferir("embalagem", embNome, esperadoEmb ?? null);
});

console.log(`\n${rev.nome}: ${produtos.length} produtos no banco, ${linhas} lidos de volta`);
console.log(divergencias === 0 ? "IDA E VOLTA SEM PERDA" : `${divergencias} DIVERGENCIA(S)`);
process.exit(divergencias === 0 && faltou === 0 ? 0 : 1);
