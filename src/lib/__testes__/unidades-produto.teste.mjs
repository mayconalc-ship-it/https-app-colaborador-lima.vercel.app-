// As quatro unidades e a conversao para HL. O que este teste guarda:
// TUDO passa por caixa (um fator so no cadastro), fator ausente RECUSA
// em vez de valer zero, e a mensagem diz QUAL campo falta.
//   npx tsx src/lib/__testes__/unidades-produto.teste.mjs
import {
  emCaixas, calcularHl, calcularPaletes, faltaNoCadastro,
  unidadesDisponiveis, ehUnidadeProduto, UNIDADES_PRODUTO,
} from "../unidades-produto.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// Produto real do cadastro: 0,06 HL/caixa, 154 cx/palete, 12 un/caixa.
// Lastro tipico: 154 caixas em 7 camadas = 22 caixas por lastro.
const p = { fatorHecto: 0.06, caixasPallet: 154, caixasPorLastro: 22, unidadesPorCaixa: 12 };

console.log("== A ORDEM E A DA OPERACAO ==");
// Do maior para o menor: e como o patio pensa, e como o seletor aparece.
eq("palete, lastro, caixa, unidade", [...UNIDADES_PRODUTO], ["palete", "lastro", "caixa", "unidade"]);

console.log("\n== TUDO PASSA POR CAIXA ==");
eq("1 palete = 154 caixas", emCaixas(1, "palete", p), 154);
eq("1 lastro = 22 caixas", emCaixas(1, "lastro", p), 22);
eq("5 caixas = 5 caixas", emCaixas(5, "caixa", p), 5);
// Fracao e o certo: 6 garrafas de uma caixa de 12 sao meia caixa.
eq("6 unidades = meia caixa", emCaixas(6, "unidade", p), 0.5);

console.log("\n== E SO ENTAO VIRA HL ==");
eq("1 palete", calcularHl(1, "palete", p), 9.24);   // 154 x 0,06
eq("1 lastro", calcularHl(1, "lastro", p), 1.32);   //  22 x 0,06
eq("10 caixas", calcularHl(10, "caixa", p), 0.6);
eq("12 unidades = 1 caixa", calcularHl(12, "unidade", p), 0.06);
// Sete lastros tem de dar o palete inteiro (7 x 22 = 154).
eq("7 lastros = 1 palete", calcularHl(7, "lastro", p), calcularHl(1, "palete", p));

console.log("\n== TRES CASAS: garrafa solta nao pode somar zero ==");
// 1 garrafa = 0,005 HL. Arredondando a duas casas viraria 0,01; a
// nenhuma, viraria 0 -- e cem lancamentos somariam nada.
eq("1 unidade tem HL proprio", calcularHl(1, "unidade", p), 0.005);

console.log("\n== FATOR AUSENTE RECUSA, NAO ZERA ==");
const semLastro = { ...p, caixasPorLastro: null };
eq("lastro sem o fator e null", calcularHl(1, "lastro", semLastro), null);
// Mas as outras unidades continuam funcionando -- falta um fator, nao o
// cadastro inteiro.
eq("palete continua valendo", calcularHl(1, "palete", semLastro), 9.24);
eq("caixa nao depende de fator nenhum", calcularHl(1, "caixa", semLastro), 0.06);

const semHecto = { ...p, fatorHecto: null };
eq("sem Fator Hecto, nada vira HL", calcularHl(1, "caixa", semHecto), null);
eq("nem palete", calcularHl(1, "palete", semHecto), null);

eq("zero nao e quantidade", calcularHl(0, "caixa", p), null);
eq("negativo tambem nao", calcularHl(-1, "caixa", p), null);

console.log("\n== A MENSAGEM DIZ QUAL CAMPO FALTA ==");
eq("lastro sem fator", faltaNoCadastro("lastro", semLastro), "caixas por lastro");
eq("palete sem fator", faltaNoCadastro("palete", { ...p, caixasPallet: null }), "caixas por palete");
eq("unidade sem fator", faltaNoCadastro("unidade", { ...p, unidadesPorCaixa: null }), "unidades por caixa");
// O Fator Hecto vem primeiro: sem ele nenhuma unidade funciona, e apontar
// o outro campo mandaria a pessoa consertar o que nao resolve.
eq("sem Fator Hecto ele e o culpado", faltaNoCadastro("lastro", { ...semHecto, caixasPorLastro: null }), "Fator Hecto");
eq("cadastro completo nao falta nada", faltaNoCadastro("palete", p), null);

console.log("\n== O QUE ESTE PRODUTO ACEITA ==");
eq("cadastro completo aceita as quatro", unidadesDisponiveis(p), ["palete", "lastro", "caixa", "unidade"]);
eq("sem lastro, o lastro some da lista", unidadesDisponiveis(semLastro), ["palete", "caixa", "unidade"]);
eq("sem Fator Hecto nao aceita nenhuma", unidadesDisponiveis(semHecto), []);

console.log("\n== PALETES EQUIVALENTES ==");
eq("palete e ele mesmo", calcularPaletes(2, "palete", p), 2);
eq("7 lastros = 1 palete", calcularPaletes(7, "lastro", p), 1);
eq("77 caixas = meio palete", calcularPaletes(77, "caixa", p), 0.5);
// Sem como converter, ZERO e nao null: e indicador de volume, e uma
// sessao inteira sem total por causa de um produto seria pior.
eq("sem fator vira zero, nao null", calcularPaletes(1, "lastro", semLastro), 0);

console.log("\n== UNIDADE VALIDA ==");
eq("lastro agora vale", ehUnidadeProduto("lastro"), true);
eq("lixo nao", ehUnidadeProduto("caixinha"), false);
eq("nulo nao", ehUnidadeProduto(null), false);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
