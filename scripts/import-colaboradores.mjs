import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de rodar.",
  );
  process.exit(1);
}

const ADMIN_CPF = "05738764528";
const SENHA_PADRAO = "Lima@123";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cpfParaEmail(cpf) {
  return `${cpf}@colaborador.limalog.internal`;
}

const csvPath = path.join(__dirname, "..", "colaboradores-raw.csv");
const linhas = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
const [, ...dados] = linhas; // pula cabeçalho

let sucesso = 0;
const falhas = [];

for (const linha of dados) {
  const [nome, cpf, matricula, cargo, area, revenda, empresa] =
    linha.split(";");

  if (!cpf || cpf.length !== 11) {
    falhas.push({ nome, cpf, motivo: "CPF inválido" });
    continue;
  }

  const email = cpfParaEmail(cpf);
  const role = cpf === ADMIN_CPF ? "admin" : "colaborador";

  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password: SENHA_PADRAO,
      email_confirm: true,
    });

  let userId = userData?.user?.id;

  if (userError) {
    if (userError.message.includes("already been registered")) {
      const { data: existentes } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const existente = existentes?.users.find((u) => u.email === email);
      if (existente) {
        userId = existente.id;
      } else {
        falhas.push({ nome, cpf, motivo: userError.message });
        continue;
      }
    } else {
      falhas.push({ nome, cpf, motivo: userError.message });
      continue;
    }
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    nome,
    cpf,
    matricula,
    cargo,
    area,
    revenda,
    empresa,
    role,
  });

  if (profileError) {
    falhas.push({ nome, cpf, motivo: "perfil: " + profileError.message });
    continue;
  }

  sucesso++;
  console.log(`OK: ${nome} (${cpf}) - ${role}`);
}

console.log(`\nConcluído: ${sucesso} de ${dados.length} importados.`);
if (falhas.length) {
  console.log(`\nFalhas (${falhas.length}):`);
  falhas.forEach((f) => console.log(` - ${f.nome} (${f.cpf}): ${f.motivo}`));
}
