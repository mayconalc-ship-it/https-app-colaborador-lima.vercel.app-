// A lista de PDVs VIP: colunas pelo nome, #N/A do Excel, segmento padrão.
//   npx tsx src/lib/__testes__/vips.teste.mjs
import { acharColunasVip, lerListaVip } from "../vips.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  ok(nome, bom, bom ? "" : `obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

console.log("== COLUNAS ==");
eq("planilha de Barreiras", acharColunasVip(["Cód", "Nome PDV", "Setor", "Segmento", "Endereço", "Cidade", "GV"]), { codPdv: 0, segmento: 3, nome: 1, setor: 2, gv: 6, cidade: 5 });
eq("código do cliente com outro nome", acharColunasVip(["Código Cliente", "Razão Social"]).codPdv, 0);

console.log("== LISTA ==");
const r = lerListaVip([
  ["Clientes especiais"],
  ["Cód", "Nome PDV", "Setor", "Segmento", "Cidade", "GV"],
  ["004510", "Bar do Zé", "110", "vip", "Barreiras", "#N/A"],
  ["4825", "Mercado", "#N/A", "CONTRATO", "LEM", "Ismael"],
  ["4510", "Repetido", "", "ZÉ", "", ""],
  ["", "", "", "", "", ""],
  ["#N/A", "Sem código", "", "VIP", "", ""],
]);
eq("cabeçalho abaixo do título, zeros fora, repetido fica o primeiro", r.vips.map((v) => v.codPdv), ["4510", "4825"]);
eq("segmento em maiúsculas e #N/A vira vazio", r.vips[0], { codPdv: "4510", segmento: "VIP", nome: "Bar do Zé", setor: "110", gv: null, cidade: "Barreiras" });
eq("linha sem código conta, linha vazia não", r.semCodigo, 1);
eq("sem coluna de segmento, todo mundo é VIP", lerListaVip([["Código"], ["123"]]).vips[0].segmento, "VIP");
ok("sem coluna de código: erro com o cabeçalho lido", /não achei/.test(lerListaVip([["Nome", "Cidade"], ["a", "b"]]).erro || ""));

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
