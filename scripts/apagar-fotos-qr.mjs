import { createClient } from "@supabase/supabase-js";

/*
 * APAGA AS FOTOS DOS COMPROVANTES DO QR DE CONTINGÊNCIA DE UM PERÍODO
 * (25/10/2026). O Storage do plano gratuito tem 1 GB e estava em 929 MB,
 * 626 MB só de comprovante. O comprovante fica (cliente, valor, NF,
 * conferência, edições); saem as fotos e as miniaturas.
 *
 * Sem --apagar, só conta o que sairia. Apagar não tem volta.
 *
 *   node --env-file=.env.local scripts/apagar-fotos-qr.mjs --de 2026-10-12 --ate 2026-10-18
 *   node --env-file=.env.local scripts/apagar-fotos-qr.mjs --de 2026-10-12 --ate 2026-10-18 --apagar
 *
 * --so-conferidos deixa de fora o comprovante que o financeiro ainda não
 * conferiu (ou marcou divergente): esse ainda pode precisar da foto.
 */

const argumento = (nome) => {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
};
const de = argumento("--de");
const ate = argumento("--ate");
const APAGAR = process.argv.includes("--apagar");
const SO_CONFERIDOS = process.argv.includes("--so-conferidos");

if (!/^\d{4}-\d{2}-\d{2}$/.test(de ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(ate ?? "") || de > ate) {
  console.error("Use: --de AAAA-MM-DD --ate AAAA-MM-DD (o dia do comprovante, ponta a ponta)");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY: rode com node --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lezoymdvhhndhoxuumcc.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// O mesmo critério da tela de conferência (qr-contingencia-server, comFotos).
const fechado = (c) =>
  c.conferencia_situacao === "conferido" ||
  c.conferencia_situacao === "desconsiderado" ||
  (!c.conferencia_situacao && c.conferido_em);

// A mesma regra de caminhoDaMiniatura em src/lib/qr-contingencia-server.ts.
const miniatura = (caminho) => `mini/${caminho.replace(/\.[a-z0-9]+$/i, "")}.webp`;

const comprovantes = [];
for (let a = 0; ; a += 1000) {
  const { data, error } = await supabase
    .from("qr_comprovantes")
    .select("id, conferido_em, conferencia_situacao")
    .gte("data", de)
    .lte("data", ate)
    .order("id")
    .range(a, a + 999);
  if (error) {
    console.error("Erro ao ler os comprovantes:", error.message);
    process.exit(1);
  }
  comprovantes.push(...data);
  if (data.length < 1000) break;
}

const alvo = SO_CONFERIDOS ? comprovantes.filter(fechado) : comprovantes;
const ids = alvo.map((c) => c.id);
const fotos = [];
for (let i = 0; i < ids.length; i += 150) {
  const { data, error } = await supabase
    .from("qr_comprovante_fotos")
    .select("id, caminho")
    .in("comprovante_id", ids.slice(i, i + 150));
  if (error) {
    console.error("Erro ao ler as fotos:", error.message);
    process.exit(1);
  }
  fotos.push(...data);
}

console.log(`Período: ${de} a ${ate}`);
console.log(`Comprovantes no período: ${comprovantes.length} (${comprovantes.filter(fechado).length} conferidos)`);
console.log(`Comprovantes que perdem as fotos: ${alvo.length}, sendo ${alvo.filter((c) => !fechado(c)).length} AINDA NÃO conferidos`);
console.log(`Fotos a apagar: ${fotos.length} (~${Math.round((fotos.length * 95) / 1000)} MB pela média de 95 KB)`);

if (!APAGAR) {
  console.log("\nNada foi apagado. Para apagar de verdade, rode de novo com --apagar.");
  process.exit(0);
}

// Lote a lote: a linha só sai do banco depois que o arquivo saiu do
// bucket. Se o bucket recusar, para ali, e o que ficou continua inteiro.
let apagadas = 0;
for (let i = 0; i < fotos.length; i += 100) {
  const lote = fotos.slice(i, i + 100);
  const caminhos = lote.map((f) => f.caminho);
  const { error: erroBucket } = await supabase.storage
    .from("comprovantes")
    .remove([...caminhos, ...caminhos.map(miniatura)]);
  if (erroBucket) {
    console.error(`Parou: o bucket recusou (${erroBucket.message}). ${apagadas} fotos já tinham saído.`);
    process.exit(1);
  }
  const { error: erroBanco } = await supabase
    .from("qr_comprovante_fotos")
    .delete()
    .in("id", lote.map((f) => f.id));
  if (erroBanco) {
    console.error(`Parou: os arquivos saíram, mas o banco recusou (${erroBanco.message}). ${apagadas} fotos completas antes deste lote.`);
    process.exit(1);
  }
  apagadas += lote.length;
  console.log(`  ${apagadas}/${fotos.length}`);
}

console.log(`\nPronto: ${apagadas} fotos apagadas.`);
