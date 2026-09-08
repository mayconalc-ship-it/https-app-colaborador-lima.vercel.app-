// A URL de volta de uma acao de servidor. Os dois erros que ela evita sao
// SILENCIOSOS: a tela nao quebra, so deixa de dizer o que aconteceu.
//   npx tsx src/lib/__testes__/url-de-volta.teste.mjs
import { voltarCom } from "../url-de-volta.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${obtido}, esperado ${esperado}`}`);
}

console.log("\nURL DE VOLTA");
eq("destino simples usa ?", voltarCom("/admin/rotas", "sucesso", "ok"), "/admin/rotas?sucesso=ok");
// O bug de 07/09/2026 no painel de anomalias: "&" fixo num destino sem query.
eq("destino com query usa &",
  voltarCom("/gestao/anomalias?ver=atrasadas", "erro", "falhou"),
  "/gestao/anomalias?ver=atrasadas&erro=falhou");
// A ancora tem que ficar por ULTIMO, senao o parametro entra no fragmento.
eq("ancora vai para o fim",
  voltarCom("/admin/fontes-de-dados?aberta=rv#fonte-rv", "sucesso", "ok"),
  "/admin/fontes-de-dados?aberta=rv&sucesso=ok#fonte-rv");
eq("ancora sem query tambem",
  voltarCom("/admin/fontes-de-dados#fonte-rv", "sucesso", "ok"),
  "/admin/fontes-de-dados?sucesso=ok#fonte-rv");
eq("mensagem e escapada",
  voltarCom("/admin/rotas", "sucesso", "2 rota(s) & 1 erro"),
  "/admin/rotas?sucesso=2%20rota(s)%20%26%201%20erro");
eq("acento nao quebra",
  voltarCom("/admin/rv", "erro", "Área inválida"),
  "/admin/rv?erro=%C3%81rea%20inv%C3%A1lida");

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
