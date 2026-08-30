// A regra do alerta de gas. Um alerta que dispara errado e pior que
// alerta nenhum: ou vira barulho ignorado, ou deixa a operacao parar.
//   npx tsx src/lib/__testes__/gas-p20.teste.mjs
import {
  precisaPedirGas, urgenciaDoEstoque, textoDoAlerta,
  telefoneParaLink, formatarTelefone, tempoAberto,
  ESTOQUE_MINIMO_PADRAO,
} from "../gas-p20.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
function ok(nome, cond) {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}`);
}

console.log("== QUANDO PEDIR ==");
eq("padrao e 2", ESTOQUE_MINIMO_PADRAO, 2);
ok("2 cheios pede (o limite ENTRA)", precisaPedirGas(2, 2));
ok("1 cheio pede", precisaPedirGas(1, 2));
ok("zero pede", precisaPedirGas(0, 2));
ok("3 cheios nao pede", !precisaPedirGas(3, 2));
// Troca antiga nao tem contagem -- nao pode acender alerta retroativo.
ok("sem contagem NAO pede", !precisaPedirGas(null, 2));
// O limite e configuravel no Admin.
ok("com minimo 5, quatro cheios pedem", precisaPedirGas(4, 5));
ok("com minimo 0, so zero pede", precisaPedirGas(0, 0));
ok("com minimo 0, um cheio nao pede", !precisaPedirGas(1, 0));

console.log("\n== URGENCIA ==");
eq("zero e critico", urgenciaDoEstoque(0), "critico");
eq("um e baixo", urgenciaDoEstoque(1), "baixo");
eq("dois e baixo", urgenciaDoEstoque(2), "baixo");

console.log("\n== TEXTO ==");
ok("zero fala em acabou", textoDoAlerta(0).titulo.includes("Acabou"));
ok("um usa singular", textoDoAlerta(1).mensagem.includes("Resta 1 botijão"));
ok("dois usa plural", textoDoAlerta(2).mensagem.includes("Restam 2 botijões"));

console.log("\n== TELEFONE ==");
eq("celular com DDD vira digitos", telefoneParaLink("(77) 99999-8888"), "77999998888");
eq("fixo sem DDD ainda disca", telefoneParaLink("3611-2233"), "36112233");
eq("curto demais nao vira link", telefoneParaLink("1234"), null);
eq("vazio nao vira link", telefoneParaLink(""), null);
eq("nulo nao vira link", telefoneParaLink(null), null);
eq("formata celular", formatarTelefone("77999998888"), "(77) 99999-8888");
eq("formata fixo", formatarTelefone("7736112233"), "(77) 3611-2233");
// 0800 tem 11 digitos e cairia na regra do celular, virando
// "(08) 00111-2222" na tela do empilhador. DDD nunca comeca com zero.
eq("0800 passa intacto", formatarTelefone("0800 111 2222"), "0800 111 2222");
eq("0800 colado tambem", formatarTelefone("08001112222"), "08001112222");
eq("numero curto passa inteiro", formatarTelefone("3611-2233"), "3611-2233");
eq("vazio vira vazio", formatarTelefone(null), "");

console.log("\n== HA QUANTO TEMPO ==");
const base = new Date("2026-08-30T12:00:00Z");
const antes = (min) => new Date(base.getTime() - min * 60000).toISOString();
eq("30 minutos", tempoAberto(antes(30), base), "30 min");
eq("uma hora certa", tempoAberto(antes(60), base), "1 h");
eq("hora e minuto", tempoAberto(antes(95), base), "1 h 35 min");
eq("um dia", tempoAberto(antes(60 * 25), base), "1 dia");
eq("varios dias", tempoAberto(antes(60 * 24 * 3), base), "3 dias");
// Relogio do cliente adiantado nao pode virar tempo negativo.
eq("futuro nao vira negativo", tempoAberto(new Date(base.getTime() + 60000).toISOString(), base), "0 min");

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
