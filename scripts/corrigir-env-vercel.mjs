import { spawn } from "node:child_process";

// O PowerShell adiciona um BOM (﻿) ao redirecionar texto para stdin,
// o que corrompia as chaves. Aqui escrevemos os bytes exatos.
//
// Valores vêm do ambiente — nunca hardcoded aqui. Rode assim:
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/corrigir-env-vercel.mjs
const NOMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const VARS = {};
for (const nome of NOMES) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`Faltando variável de ambiente: ${nome}`);
    process.exit(1);
  }
  VARS[nome] = valor;
}

function rodar(args, valor) {
  return new Promise((resolve) => {
    const p = spawn("npx", ["--yes", "vercel", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    if (valor !== undefined) {
      p.stdin.write(Buffer.from(valor, "ascii"));
    }
    p.stdin.end();
    p.on("close", (code) => resolve({ code, saida }));
  });
}

for (const [nome, valor] of Object.entries(VARS)) {
  const rm = await rodar(["env", "rm", nome, "production", "--yes"]);
  console.log(`rm ${nome}: ${rm.code === 0 ? "removida" : "nao existia"}`);

  const add = await rodar(["env", "add", nome, "production"], valor);
  const ok = add.saida.includes("Added");
  console.log(`add ${nome}: ${ok ? "OK" : "FALHOU"}`);
  if (!ok) console.log(add.saida.slice(-400));
}
