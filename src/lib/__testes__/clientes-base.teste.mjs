// A base de clientes. O risco aqui nao e o import falhar -- e ele
// "funcionar" trazendo a coluna errada, ou montar um telefone que abre
// conversa com um desconhecido. Quase todo teste abaixo guarda um caso em
// que o dado NAO deve ser aceito.
//   npx tsx src/lib/__testes__/clientes-base.teste.mjs
import {
  chaveDoCabecalho, acharColunas, normalizarTelefone, codigoDaBase,
  lerLinhaDeCliente, linkDoWhatsApp, idDoLinkDoDrive,
} from "../clientes-base.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("\nCABECALHO");
eq("tira acento e caixa", chaveDoCabecalho("Endereço"), "endereco");
eq("tira espaco e pontuacao", chaveDoCabecalho("TELEFONE 1"), "telefone1");

console.log("\nACHAR AS COLUNAS");
const cab = ["Codigo Cliente", "Razao Social", "Endereço", "Bairro", "Municipio", "Telefone", "Celular"];
const col = acharColunas(cab);
eq("acha o codigo", col.codPdv, 0);
eq("acha o nome pela razao social", col.nome, 1);
eq("celular ganha do telefone fixo", col.telefone, 6);
eq("municipio conta como cidade", col.cidade, 4);
eq("acha o endereco com acento", col.endereco, 2);

// "Cliente" sozinho e o NOME em muitas exportacoes -- mas quando nao ha
// outra coluna de codigo, ele e o codigo. A ordem dos sinonimos resolve,
// e o "nao repete coluna" impede que o mesmo indice vire os dois.
const so = acharColunas(["Cliente", "Fone"]);
eq("sem coluna melhor, Cliente vira o codigo", so.codPdv, 0);
eq("e nao vira o nome tambem", so.nome, undefined);
eq("planilha sem bairro nao inventa coluna", so.bairro, undefined);

console.log("\nTELEFONE");
eq("celular com DDD ganha o 55", normalizarTelefone("(77) 99999-8888"), "5577999998888");
eq("fixo com DDD tambem", normalizarTelefone("77 3456-7890"), "557734567890");
eq("ja com 55 nao duplica", normalizarTelefone("5577999998888"), "5577999998888");
eq("sem DDD nao passa", normalizarTelefone("99999-8888"), null);
eq("DDD invalido nao passa", normalizarTelefone("0099999888"), null);
eq("onze digitos sem o 9 nao e celular", normalizarTelefone("77 3456-78901"), null);
eq("vazio e null", normalizarTelefone(""), null);
eq("coluna com traco e null", normalizarTelefone("-"), null);
eq("numero comprido demais nao vira telefone", normalizarTelefone("123456789012345"), null);
// O nono digito NAO e inventado: fixo continua fixo.
eq("fixo nao vira celular", normalizarTelefone("7734567890"), "557734567890");

console.log("\nCODIGO");
eq("tira zeros a esquerda", codigoDaBase("0002178"), "2178");
eq("aceita numero", codigoDaBase(2178), "2178");
eq("so zeros vira zero", codigoDaBase("0000"), "0");
eq("sem digito e null", codigoDaBase("TOTAL"), null);
eq("vazio e null", codigoDaBase(""), null);

console.log("\nLINHA");
const colunas = { codPdv: 0, nome: 1, telefone: 2, cidade: 3, bairro: 4, endereco: 5 };
eq("linha completa", lerLinhaDeCliente(["0002178", "BAR DO JAIR", "(77) 99999-8888", "Sao Felix", "Centro", "Rua A, 10"], colunas), {
  codPdv: "2178", nome: "BAR DO JAIR", fantasia: null, telefone: "5577999998888",
  cidade: "Sao Felix", bairro: "Centro", endereco: "Rua A, 10",
});

// A planilha real das duas revendas traz Razao Social E Nome Fantasia
// (11/09/2026): cada uma vai para o seu campo.
const cabReal = ["Cód PDV", "Nome Fantasia", "Razão Social", "Endereço", "Bairro", "Cidade", "Telefone(s)"];
const colReal = acharColunas(cabReal);
eq("razao social vai para o nome", colReal.nome, 2);
eq("nome fantasia vai para a fantasia", colReal.fantasia, 1);
eq(
  "linha com as duas",
  lerLinhaDeCliente(["961", "BAR DO ROMARIO", "52.535.056 ROMARIO DOS SANTOS SILVA", "R JABORANDI 24", "CENTRO", "SAO FELIX", "77998069328"], colReal).fantasia,
  "BAR DO ROMARIO",
);
eq("so com a fantasia, ela fica no nome", acharColunas(["Codigo Cliente", "Nome Fantasia"]).nome, 1);
eq("sem codigo nao vira cliente", lerLinhaDeCliente(["", "TOTAL", "", "", "", ""], colunas), null);
eq("telefone torto vira null, o cliente entra", lerLinhaDeCliente(["91", "KIT LANCHES", "0000", "Correntina", "", ""], colunas).telefone, null);
eq("celula vazia vira null e nao string vazia", lerLinhaDeCliente(["91", "", "", "", "", ""], colunas).nome, null);

console.log("\nLINK DO WHATSAPP");
eq("com numero abre a conversa certa", linkDoWhatsApp("5577999998888", "Oi"), "https://wa.me/5577999998888?text=Oi");
eq("sem numero cai no seletor de contato", linkDoWhatsApp(null, "Oi"), "https://wa.me/?text=Oi");
eq("escapa o texto", linkDoWhatsApp("5577999998888", "dia 08/09 & ok"), "https://wa.me/5577999998888?text=dia%2008%2F09%20%26%20ok");

// O LINK COLADO ERRADO e o defeito mais comum de todo import do app. Cada
// forma abaixo baixa por um endereco diferente, e confundir duas devolve
// "nao consegui baixar" para um link que esta perfeito.
console.log("\nLINK DO DRIVE");
eq("arquivo enviado ao Drive", idDoLinkDoDrive("https://drive.google.com/file/d/1AbC_def-GHI23456789/view?usp=sharing"),
  { arquivo: "1AbC_def-GHI23456789" });
eq("planilha do Google nao e arquivo", idDoLinkDoDrive("https://docs.google.com/spreadsheets/d/1AbC_def-GHI23456789/edit#gid=0"),
  { planilhaGoogle: "1AbC_def-GHI23456789" });
eq("pasta", idDoLinkDoDrive("https://drive.google.com/drive/folders/1AbC_def-GHI23456789"),
  { pasta: "1AbC_def-GHI23456789" });
eq("link antigo com ?id=", idDoLinkDoDrive("https://drive.google.com/open?id=1AbC_def-GHI23456789"),
  { arquivo: "1AbC_def-GHI23456789" });
eq("id cru", idDoLinkDoDrive("1AbC_def-GHI23456789"), { arquivo: "1AbC_def-GHI23456789" });
eq("espaco em volta nao atrapalha", idDoLinkDoDrive("  https://drive.google.com/file/d/1AbC_def-GHI23456789/view  "),
  { arquivo: "1AbC_def-GHI23456789" });
eq("vazio nao vira nada", idDoLinkDoDrive(""), {});
eq("texto que nao e link", idDoLinkDoDrive("a base de clientes"), {});

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
