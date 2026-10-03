// Roda todos os testes de src/lib/__testes__ e diz quais falharam.
//   node scripts/rodar-testes.mjs
//
// Os testes são scripts soltos (imprimem OK/FALHOU e saem com código 1 se
// algo falhar). Este roteiro só passa por todos, um de cada vez, e devolve
// erro se QUALQUER um falhar -- é o que o GitHub roda a cada PR
// (.github/workflows/verificar.yml).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const pasta = "src/lib/__testes__";
const arquivos = readdirSync(pasta).filter((a) => a.endsWith(".teste.mjs")).sort();
const falharam = [];

for (const a of arquivos) {
  const r = spawnSync("npx", ["--yes", "tsx", join(pasta, a)], { encoding: "utf8", shell: process.platform === "win32" });
  if (r.status === 0) {
    console.log(`  ok      ${a}`);
  } else {
    falharam.push(a);
    console.log(`  FALHOU  ${a}`);
    // Só as linhas que interessam: as que falharam e o erro, se houver.
    const saida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    saida
      .split("\n")
      .filter((l) => /FALHOU|Error|error/.test(l))
      .slice(0, 15)
      .forEach((l) => console.log(`          ${l.trim()}`));
  }
}

console.log(`\n${arquivos.length - falharam.length} de ${arquivos.length} arquivos de teste passaram.`);
if (falharam.length) {
  console.log(`Falharam: ${falharam.join(", ")}`);
  process.exit(1);
}
