// O "salvar no lugar" das ações antigas: noLugar + pararComErro/Sucesso.
//   npx tsx src/lib/__testes__/resultado-acao.teste.mjs
import { noLugar, pararComErro, pararComSucesso, pararPelaUrl, deuCerto } from "../resultado-acao.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok("erro no meio para tudo e volta o aviso vermelho",
  eq(await noLugar(async () => { pararComErro("Quantidade inválida."); throw new Error("não devia chegar"); }), { ok: false, erro: "Quantidade inválida." }));
ok("sucesso volta o aviso verde", eq(await noLugar(async () => pararComSucesso("Salvo!")), { ok: true, mensagem: "Salvo!", irPara: undefined }));
ok("sucesso que leva a outra tela", eq(await noLugar(async () => pararComSucesso("Iniciado.", "/x/1")), { ok: true, mensagem: "Iniciado.", irPara: "/x/1" }));
ok("terminou sem dizer nada: 'Salvo.'", eq(await noLugar(async () => {}), { ok: true, mensagem: "Salvo.", irPara: undefined }));
ok("devolveu um resultado pronto: passa igual", eq(await noLugar(async () => deuCerto("pronto")), { ok: true, mensagem: "pronto", irPara: undefined }));
let passou = false;
try { await noLugar(async () => { throw new Error("NEXT_REDIRECT"); }); } catch (e) { passou = e.message === "NEXT_REDIRECT"; }
ok("outro erro (redirect de login, falha real) passa reto", passou);
ok("aviso no endereço: erro", eq(await noLugar(async () => pararPelaUrl("erro=Pilar+inv%C3%A1lido")), { ok: false, erro: "Pilar inválido" }));
ok("aviso no endereço: sucesso", eq(await noLugar(async () => pararPelaUrl("sucesso=Pilar+criado")), { ok: true, mensagem: "Pilar criado", irPara: undefined }));

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
