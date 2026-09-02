// O nome do parceiro na faixa da tela inicial. O titulo e escrito para o
// JORNAL ("Parceria com a Drogaria X"); na faixa, que ja se chama
// Parcerias, o prefixo repetido tres vezes come o espaco do unico pedaco
// que interessa.
//   npx tsx src/lib/__testes__/parcerias.teste.mjs
import { nomeDoParceiro } from "../../components/FaixaParcerias.tsx";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = obtido === esperado;
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("== TITULOS REAIS DO JORNAL (03/09/2026) ==");
eq("com artigo", nomeDoParceiro("Parceria com a Drogaria MisterFarma"), "Drogaria MisterFarma");
eq("sem artigo", nomeDoParceiro("Parceria com SUPERGAS DO OESTE"), "SUPERGAS DO OESTE");
// Emoji no comeco: a faixa ja tem o icone dela, dois brigando na mesma
// linha nao ajudam ninguem.
eq("emojis na frente", nomeDoParceiro("🚗⛽ 🤝 Parceria posto Vila Mariano"), "posto Vila Mariano");

console.log("\n== OUTRAS FORMAS QUE O RH ESCREVE ==");
eq("sem 'com'", nomeDoParceiro("Parceria Academia Corpo e Movimento"), "Academia Corpo e Movimento");
eq("com 'o'", nomeDoParceiro("Parceria com o Restaurante do Ze"), "Restaurante do Ze");
eq("com 'os'", nomeDoParceiro("Parceria com os Laboratorios Unidos"), "Laboratorios Unidos");
eq("minusculo", nomeDoParceiro("parceria com a Otica Diniz"), "Otica Diniz");

console.log("\n== O QUE NAO PODE ACONTECER ==");
// Titulo que nao segue o padrao passa inteiro: cortar por adivinhacao
// deixaria a faixa mostrando meia frase.
eq("titulo fora do padrao fica inteiro",
  nomeDoParceiro("Novos descontos para o time"), "Novos descontos para o time");
// "Parcerias" no plural NAO e o prefixo -- comeca a frase de verdade.
eq("plural nao e prefixo", nomeDoParceiro("Parcerias novas em setembro"), "Parcerias novas em setembro");
eq("espacos sobrando", nomeDoParceiro("   Parceria com a   Drogaria X  "), "Drogaria X");
eq("vazio nao quebra", nomeDoParceiro(""), "");
// Acento tem de sobreviver: a limpeza do comeco corta so o que NAO e
// letra nem numero, e "Ó" e letra.
eq("acento no comeco sobrevive", nomeDoParceiro("Ótica Diniz"), "Ótica Diniz");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
