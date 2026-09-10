// A planilha de colaboradores. O risco aqui nao e o arquivo nao abrir -- e
// ele "funcionar" cadastrando CPF errado, a pessoa na area que o app nao
// entende, ou atualizando pelo arquivo de uma unidade alguem da outra.
//   npx tsx src/lib/__testes__/colaboradores-planilha.teste.mjs
import {
  chaveDoCabecalho, acharColunas, cpfValido, areaCanonica,
  linhasDaMatriz, validarLinhas, classificar,
} from "../colaboradores-planilha.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// CPFs de teste validos (gerados pelo algoritmo, nao sao de ninguem).
const A = "52998224725";
const B = "11144477735";
const C = "01234567890";

console.log("\nCABECALHO");
eq("tira acento e caixa", chaveDoCabecalho("Área"), "area");
// A planilha de Barreiras veio assim, com uma coluna a mais no meio.
const col = acharColunas(["Matricula", "Nome", "Admissão", "Cargo", "Área", "CPF"]);
eq("acha matricula", col.matricula, 0);
eq("acha nome", col.nome, 1);
eq("acha cargo", col.cargo, 3);
eq("acha area com acento", col.area, 4);
eq("acha cpf no fim", col.cpf, 5);
eq("Funcao conta como cargo", acharColunas(["Nome", "CPF", "Função", "Setor"]).cargo, 2);
eq("Setor conta como area", acharColunas(["Nome", "CPF", "Função", "Setor"]).area, 3);

console.log("\nCPF");
eq("valido", cpfValido(A), true);
eq("digito errado", cpfValido("52998224726"), false);
eq("todos iguais nao passa", cpfValido("11111111111"), false);
eq("10 digitos nao passa", cpfValido("5299822472"), false);

console.log("\nAREA");
// Decisao do dono em 10/09/2026: TRANSPORTE vira DISTRIBUICAO URBANA.
eq("TRANSPORTE converte", areaCanonica("TRANSPORTE"), { area: "DISTRIBUIÇÃO URBANA", convertida: true });
eq("em minusculo tambem", areaCanonica("transporte ").area, "DISTRIBUIÇÃO URBANA");
eq("area conhecida fica", areaCanonica("APOIO LOGISTICO"), { area: "APOIO LOGISTICO", convertida: false });

console.log("\nMATRIZ");
const m = linhasDaMatriz(["Matricula", "Nome", "Cargo", "Área", "CPF"], [
  ["10", "JOAO DA SILVA", "MOTORISTA", "TRANSPORTE", A],
  ["", "", "", "", ""],
], 2);
eq("linha em branco nao vira cadastro", m.brutas.length, 1);
eq("numero da linha e o do Excel", m.brutas[0].linha, 2);
eq("sem coluna de CPF diz qual falta", linhasDaMatriz(["Nome", "Cargo", "Área"], [], 2).faltam, ["CPF"]);

console.log("\nVALIDACAO");
const b = (linha, nome, cpf, cargo = "MOTORISTA", area = "TRANSPORTE", matricula = "") =>
  ({ linha, matricula, nome, cpf, cargo, area });
const v = validarLinhas([
  b(2, "JOAO DA SILVA", A),
  b(3, "MARIA", B),
  b(4, "PEDRO SOUZA", "123"),
  b(5, "ANA LIMA", "52998224726"),
  b(6, "JOSE REPETIDO", A),
  b(7, "SEM CARGO SILVA", B, ""),
  b(8, "ZERO PERDIDO", "1234567890"),
  b(9, "  CARLA   DIAS  ", B),
]);
eq("so as boas passam", v.validas.map((x) => x.linha), [2, 8, 9]);
eq("nome de uma palavra e recusado", v.problemas.find((p) => p.linha === 3).motivo.startsWith("nome incompleto"), true);
eq("CPF curto diz quantos digitos", v.problemas.find((p) => p.linha === 4).motivo, "CPF com 3 dígitos");
eq("digito verificador errado e recusado", v.problemas.find((p) => p.linha === 5).motivo.startsWith("CPF inválido"), true);
eq("CPF repetido aponta a outra linha", v.problemas.find((p) => p.linha === 6).motivo, "CPF repetido — já está na linha 2");
eq("sem cargo e recusado", v.problemas.find((p) => p.linha === 7).motivo, "sem cargo");
eq("zero da frente volta", v.validas.find((x) => x.linha === 8).cpf, C);
eq("e fica marcado como corrigido", v.validas.find((x) => x.linha === 8).cpfCorrigido, true);
eq("espacos do nome sao limpos", v.validas.find((x) => x.linha === 9).nome, "CARLA DIAS");
eq("area ja sai convertida", v.validas[0].area, "DISTRIBUIÇÃO URBANA");
eq("e guarda como veio", v.validas[0].areaDaPlanilha, "TRANSPORTE");
// 10 digitos que NAO ficam validos com o zero: recusa, nao inventa CPF.
eq("10 digitos invalidos nao sao corrigidos",
  validarLinhas([b(2, "FULANO TAL", "5299822472")]).problemas[0].motivo, "CPF com 10 dígitos");

console.log("\nCLASSIFICACAO");
const BAR = "barreiras";
const SF = "sao-felix";
const linha = (cpf, extra = {}) => ({
  linha: 2, matricula: "10", nome: "JOAO DA SILVA", cpf, cargo: "MOTORISTA",
  area: "DISTRIBUIÇÃO URBANA", areaDaPlanilha: "TRANSPORTE", cpfCorrigido: false, ...extra,
});
const existentes = new Map([
  [A, { id: "a", nome: "JOAO DA SILVA", cargo: "MOTORISTA", area: "DISTRIBUIÇÃO URBANA", matricula: "10", revendas: [BAR] }],
  [B, { id: "b", nome: "MARIA LIMA", cargo: "AJUDANTE", area: "DISTRIBUIÇÃO URBANA", matricula: "11", revendas: [BAR] }],
  [C, { id: "c", nome: "CHARLES RIBEIRO", cargo: "Conferente", area: "APOIO LOGISTICO", matricula: "12", revendas: [SF] }],
]);
const cl = classificar([
  linha(A),
  linha(B, { nome: "MARIA LIMA", cargo: "MOTORISTA", matricula: "11" }),
  linha(C, { nome: "CHARLES RIBEIRO" }),
  linha("39053344705", { nome: "NOVO NOME" }),
], existentes, BAR);
eq("CPF novo vai para criar", cl.criar.map((x) => x.cpf), ["39053344705"]);
eq("igual ao cadastro nao mexe", cl.semMudanca, 1);
eq("mudou o cargo vai para atualizar", cl.atualizar.map((x) => x.id), ["b"]);
eq("e diz o que muda", cl.atualizar[0].mudancas, ['cargo: "AJUDANTE" → "MOTORISTA"']);
// O perfil e um so para o app inteiro: o arquivo de Barreiras nao pode
// trocar o cargo de alguem de Sao Felix.
eq("CPF de outra unidade nao e tocado", cl.outraUnidade.map((x) => x.cpf), [C]);
eq("matricula em branco nao apaga a que existe",
  classificar([linha(A, { matricula: null })], existentes, BAR).semMudanca, 1);

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
