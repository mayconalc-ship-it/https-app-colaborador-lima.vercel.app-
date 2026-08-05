import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://lezoymdvhhndhoxuumcc.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const APENAS_LISTAR = process.argv.includes("--dry-run");

const { data: todos, error } = await supabase
  .from("padroes")
  .select("id, pilar, caminho, nome, arquivo_url");

if (error) {
  console.error("Erro ao ler padroes:", error.message);
  process.exit(1);
}

// Pega qualquer trecho do caminho que seja uma pasta de Modelo(s) ou
// Regulamento(s) -- inclusive variacoes como "Modelos de Padroes"
const alvos = todos.filter((p) =>
  p.caminho
    .split(" / ")
    .some((parte) => /^(modelos?|regulamentos?)\b/i.test(parte.trim())),
);

console.log(`Total no banco: ${todos.length}`);
console.log(`Para remover (Modelos/Regulamentos): ${alvos.length}`);
console.log(`Vao permanecer: ${todos.length - alvos.length}\n`);

const porPilar = {};
for (const a of alvos) {
  porPilar[a.pilar] = (porPilar[a.pilar] ?? 0) + 1;
}
console.log("Remocoes por pilar:", JSON.stringify(porPilar, null, 2));

if (APENAS_LISTAR) {
  console.log("\n(dry-run: nada foi apagado)");
  process.exit(0);
}

const prefixo = "/storage/v1/object/public/conteudo/";
const caminhosStorage = alvos
  .map((a) => {
    const idx = a.arquivo_url.indexOf(prefixo);
    return idx === -1
      ? null
      : decodeURIComponent(a.arquivo_url.slice(idx + prefixo.length));
  })
  .filter(Boolean);

for (let i = 0; i < caminhosStorage.length; i += 50) {
  const lote = caminhosStorage.slice(i, i + 50);
  const { error: storageError } = await supabase.storage
    .from("conteudo")
    .remove(lote);
  if (storageError) console.log("Aviso storage:", storageError.message);
}

const ids = alvos.map((a) => a.id);
for (let i = 0; i < ids.length; i += 100) {
  const lote = ids.slice(i, i + 100);
  const { error: deleteError } = await supabase
    .from("padroes")
    .delete()
    .in("id", lote);
  if (deleteError) {
    console.error("Erro ao apagar do banco:", deleteError.message);
    process.exit(1);
  }
}

const { count } = await supabase
  .from("padroes")
  .select("*", { count: "exact", head: true });

console.log(`\nConcluido. Registros restantes: ${count}`);
