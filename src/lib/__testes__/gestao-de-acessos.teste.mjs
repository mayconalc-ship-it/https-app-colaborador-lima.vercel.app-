// Confere as regras da gestao de acessos delegada:
//   npx tsx src/lib/__testes__/gestao-de-acessos.teste.mjs
import { alcanceDe, mesclarNoAlcance, MODULO_ACESSOS } from "../gestao-de-acessos.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) falhas++;
  console.log(`  ${a === b ? "OK " : "FALHOU"}  ${nome}${a === b ? "" : `: obtido ${a}, esperado ${b}`}`);
}
const ord = (xs) => [...xs].sort();

console.log("== ALCANCE ==");
const doAdriano = ["comunicados:ver", "comunicados:criar", "rating:ver", `${MODULO_ACESSOS}:ver`, `${MODULO_ACESSOS}:editar`];
eq("tira a propria gestao de acessos", ord(alcanceDe(doAdriano)), ["comunicados:criar", "comunicados:ver", "rating:ver"]);

console.log("\n== ADMIN (alcance nulo) ==");
eq("vale o que foi marcado", ord(mesclarNoAlcance(["rv:ver"], ["comunicados:ver", `${MODULO_ACESSOS}:ver`], null)), [`${MODULO_ACESSOS}:ver`, "comunicados:ver"]);

console.log("\n== LIDERANCA ==");
const alcance = alcanceDe(doAdriano);
const existentes = ["comunicados:ver", "rv:ver", "rv:editar", `${MODULO_ACESSOS}:ver`];
eq(
  "concede o que tem",
  ord(mesclarNoAlcance(existentes, ["comunicados:ver", "comunicados:criar", "rating:ver"], alcance)),
  [`${MODULO_ACESSOS}:ver`, "comunicados:criar", "comunicados:ver", "rating:ver", "rv:editar", "rv:ver"],
);
eq(
  "retira o que tem",
  ord(mesclarNoAlcance(existentes, [], alcance)),
  [`${MODULO_ACESSOS}:ver`, "rv:editar", "rv:ver"],
);
eq(
  "NAO concede o que nao tem (mesmo que o formulario mande)",
  ord(mesclarNoAlcance([], ["padroes:excluir", "comunicados:ver"], alcance)),
  ["comunicados:ver"],
);
eq(
  "NAO retira o que nao tem",
  mesclarNoAlcance(["rv:editar"], [], alcance).includes("rv:editar"),
  true,
);
eq(
  "NAO repassa a gestao de acessos",
  mesclarNoAlcance([], [`${MODULO_ACESSOS}:editar`], alcance).includes(`${MODULO_ACESSOS}:editar`),
  false,
);
eq(
  "NAO tira a gestao de acessos de quem ja tem",
  mesclarNoAlcance([`${MODULO_ACESSOS}:ver`], [], alcance).includes(`${MODULO_ACESSOS}:ver`),
  true,
);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS CASOS PASSARAM");
if (falhas) process.exit(1);
