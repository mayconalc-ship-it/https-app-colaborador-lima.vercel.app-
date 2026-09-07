// A lista de clientes por mapa -- o arquivo que faz o alerta da pre-rota
// deixar de ser por regiao e passar a ser por cliente.
//
// O risco aqui nao e quebrar: e ler a coluna ERRADA em silencio e pendurar
// a particularidade no cliente errado. Por isso quase todo teste guarda um
// caso em que a leitura NAO deve acontecer.
//   npx tsx src/lib/__testes__/clientes-por-mapa.teste.mjs
import { lerPlanilhaDeClientesPorMapa, lerPlanilhaDeRotas, separarClientes } from "../rotas.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

console.log("\nA COLUNA \"Clientes\" DA PROPRIA PRE-ROTA -- a fonte de verdade");
// O formato real, conferido no arquivo do Drive (07/09/2026):
// "0003163/0000588/0000461/0000550/..."
eq("separa por barra e tira os zeros",
  separarClientes("0003163/0000588/0000461"), ["3163", "588", "461"]);
eq("o mesmo cliente duas vezes conta uma", separarClientes("0000507/0000507"), ["507"]);
eq("espaco em volta nao atrapalha", separarClientes(" 0000507 / 0002178 "), ["507", "2178"]);
eq("campo vazio nao inventa cliente", separarClientes(""), []);
eq("so barras nao inventam cliente", separarClientes("///"), []);
eq("aceita ponto e virgula tambem", separarClientes("0000507;0002178"), ["507", "2178"]);
eq("codigo zero sobrevive", separarClientes("0000000/0000507"), ["507"]);

// A planilha inteira, como ela e -- so as colunas que importam aqui.
const preRotaReal = [
  "Data Entrega;Nro do Mapa;Entregas;Cidades +Entregas;Clientes",
  "01/08/2026;014768;28;SERRA DOURADA (20);0003163/0000588/0000461",
].join("\n");
const lida = lerPlanilhaDeRotas(preRotaReal);
eq("a rota e lida", lida.rotas.length, 1);
eq("e os clientes vem junto", lida.rotas[0].clientes, ["3163", "588", "461"]);
eq("mapa sem zeros", lida.rotas[0].mapa, "14768");
// Planilha antiga, sem a coluna: nao pode quebrar a importacao.
const semColuna = [
  "Data Entrega;Nro do Mapa;Entregas",
  "01/08/2026;014768;28",
].join("\n");
eq("planilha sem a coluna Clientes continua importando", lerPlanilhaDeRotas(semColuna).rotas.length, 1);
eq("e a lista fica vazia", lerPlanilhaDeRotas(semColuna).rotas[0].clientes, []);

console.log("\nO FORMATO ESPERADO");
const basico = [
  "Data Entrega;Nro do Mapa;Cod Cliente;Nome Cliente;Cidade;Bairro;Sequencia",
  "01/09/2026;014768;002178;DISTRIB DOIS IRMAOS;Santa Maria da Vitoria;Centro;3",
  "01/09/2026;014768;000507;BAR LINHA DIRETA;Coribe;Centro;5",
].join("\n");
const r = lerPlanilhaDeClientesPorMapa(basico);
eq("le as duas linhas", r.length, 2);
eq("mapa sem zeros a esquerda", r[0].mapa, "14768");
eq("codigo sem zeros a esquerda", r[0].codPdv, "2178");
eq("data em ISO", r[0].data, "2026-09-01");
eq("nome", r[0].nomePdv, "DISTRIB DOIS IRMAOS");
eq("cidade", r[0].cidade, "Santa Maria da Vitoria");
eq("bairro", r[0].bairro, "Centro");
eq("sequencia", r[0].sequencia, 3);

console.log("\nCABECALHO EM OUTRO DIALETO -- cada roteirizador chama de um jeito");
const outro = [
  "Mapa;Código do PDV;Razão Social;Município",
  "15461;2178;DISTRIB DOIS IRMAOS;Cocos",
].join("\n");
const r2 = lerPlanilhaDeClientesPorMapa(outro);
eq("acento e pontuacao no cabecalho nao atrapalham", r2.length, 1);
eq("mapa lido", r2[0].mapa, "15461");
eq("codigo lido", r2[0].codPdv, "2178");
eq("nome lido", r2[0].nomePdv, "DISTRIB DOIS IRMAOS");
eq("sem data no arquivo fica vazia", r2[0].data, "");
eq("sem sequencia fica nula", r2[0].sequencia, null);

console.log('\n"CLIENTE" SOZINHO -- o conteudo decide se e codigo ou nome');
const soCodigo = ["Mapa;Cliente", "14768;2178", "14768;507"].join("\n");
const rc = lerPlanilhaDeClientesPorMapa(soCodigo);
eq("coluna so de digitos vira CODIGO", rc.map((x) => x.codPdv), ["2178", "507"]);
eq("e o nome fica nulo", rc[0].nomePdv, null);

const soNome = ["Mapa;Cliente", "14768;BAR LINHA DIRETA"].join("\n");
eq("coluna de texto NAO vira codigo (arquivo sem codigo e recusado)", lerPlanilhaDeClientesPorMapa(soNome).length, 0);

console.log("\nO QUE NAO DEVE SER LIDO");
eq("arquivo vazio", lerPlanilhaDeClientesPorMapa(""), []);
eq("so cabecalho", lerPlanilhaDeClientesPorMapa("Mapa;Cod Cliente"), []);
// A propria pre-rota nao pode ser lida como lista de clientes: ela nao tem
// coluna de cliente, e ler errado encheria a tabela de lixo.
const preRota = [
  "Data Entrega;Nro do Mapa;Veículo;Placa;Entregas;Cidades +Entregas",
  "01/09/2026;014768;Toco;RCI4B11;20;CORIBE (20)",
].join("\n");
eq("a planilha da PRE-ROTA e recusada", lerPlanilhaDeClientesPorMapa(preRota).length, 0);
// Linha sem mapa ou sem codigo nao entra -- nao da para casar nada.
const furada = [
  "Mapa;Cod Cliente;Nome Cliente",
  ";2178;SEM MAPA",
  "14768;;SEM CODIGO",
  "14768;507;OK",
].join("\n");
eq("linha sem mapa ou sem codigo sai", lerPlanilhaDeClientesPorMapa(furada).length, 1);
eq("sobra a boa", lerPlanilhaDeClientesPorMapa(furada)[0].codPdv, "507");

console.log("\nCAMPOS COM ASPAS E PONTO E VIRGULA DENTRO");
const comAspas = [
  "Mapa;Cod Cliente;Nome Cliente;Cidade",
  '14768;2178;"BAR DO ZE; FILHOS";Coribe',
].join("\n");
eq("aspas protegem o ponto e virgula", lerPlanilhaDeClientesPorMapa(comAspas)[0].nomePdv, "BAR DO ZE; FILHOS");
eq("e a cidade seguinte continua certa", lerPlanilhaDeClientesPorMapa(comAspas)[0].cidade, "Coribe");

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
