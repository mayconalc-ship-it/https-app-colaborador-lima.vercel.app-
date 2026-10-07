// Os ciclos oferecidos no "Iniciar um novo ciclo". O que este teste
// guarda: a ordem e a DISTANCIA ate hoje, nao o calendario -- e a virada
// de ano nao pode escorregar.
//   npx tsx src/lib/__testes__/pesquisa.teste.mjs
import {
  avisoDoPeriodo,
  ciclosSugeridos,
  fimDoCiclo,
  rotuloCiclo,
  situacaoDoPeriodo,
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
} from "../pesquisa.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const so = (lista, n) => lista.slice(0, n).map((c) => c.ciclo);

console.log("== OS MAIS PROXIMOS PRIMEIRO ==");
// Hoje 03/09/2026, ciclo atual 2026-09. O mes de hoje encabeca; depois o
// que vem (10) antes do que passou (08), porque iniciar ciclo e olhar
// para frente.
const set = ciclosSugeridos("2026-09", "2026-09-03");
eq("mes de hoje primeiro, futuro antes do passado",
  so(set, 5), ["2026-09", "2026-10", "2026-08", "2026-11", "2026-07"]);
eq("a janela tem os dois lados mais o mes de hoje",
  set.length, MESES_PARA_TRAS + MESES_PARA_FRENTE + 1);

console.log("\n== A VIRADA DE ANO NAO ESCORREGA ==");
// Digitar a mao na virada troca o ano sem avisar (2026-01 vira 2025-01).
// O menu nao tem como errar isso.
const janeiro = ciclosSugeridos("2026-01", "2026-01-15");
eq("janeiro puxa dezembro do ano anterior e fevereiro",
  so(janeiro, 3), ["2026-01", "2026-02", "2025-12"]);
eq("seis meses atras de janeiro e julho do ano anterior",
  janeiro.some((c) => c.ciclo === "2025-07"), true);
const dezembro = ciclosSugeridos("2026-12", "2026-12-20");
eq("dezembro puxa janeiro do ano seguinte",
  so(dezembro, 3), ["2026-12", "2027-01", "2026-11"]);

console.log("\n== O CICLO CONFIGURADO APARECE, MESMO LONGE ==");
// Pedido do dono: o que se configura tem de aparecer aqui. Um ciclo de
// dois anos atras esta fora da janela e mesmo assim entra.
const longe = ciclosSugeridos("2024-03", "2026-09-03");
eq("o configurado esta na lista", longe.some((c) => c.ciclo === "2024-03"), true);
eq("e vem marcado como atual", longe.find((c) => c.ciclo === "2024-03").atual, true);
// Longe do mes de hoje, entao vai para o fim -- aparecer nao e liderar.
eq("mas nao rouba o topo", so(longe, 1), ["2026-09"]);

console.log("\n== HISTORICO ENTRA, SEM REPETIR ==");
const comHistorico = ciclosSugeridos("2026-09", "2026-09-03", ["2025-01", "2026-08", "2025-01"]);
eq("ciclo antigo com resposta entra", comHistorico.some((c) => c.ciclo === "2025-01"), true);
// 2026-08 ja estava na janela: nao pode aparecer duas vezes.
eq("nao duplica o que ja estava na janela",
  comHistorico.filter((c) => c.ciclo === "2026-08").length, 1);

console.log("\n== QUAL E O ATUAL ==");
eq("so um marcado como atual", set.filter((c) => c.atual).length, 1);
eq("e e o que esta rodando", set.find((c) => c.atual).ciclo, "2026-09");

console.log("\n== ENTRADA ESTRANHA NAO QUEBRA ==");
// Config nova, sem ciclo ainda.
eq("ciclo vazio nao gera lixo", ciclosSugeridos("", "2026-09-03").some((c) => c.ciclo === ""), false);
eq("mes 13 e descartado", ciclosSugeridos("2026-13", "2026-09-03").some((c) => c.ciclo === "2026-13"), false);
eq("historico com lixo e ignorado",
  ciclosSugeridos("2026-09", "2026-09-03", ["banana"]).some((c) => c.ciclo === "banana"), false);

console.log("\n== ROTULO ==");
eq("mes por extenso", rotuloCiclo("2026-08"), "Agosto/2026");
eq("formato desconhecido passa inteiro", rotuloCiclo("qualquer"), "qualquer");

console.log("\n== LIGADA, MAS FORA DO PERIODO: O AVISO DIZ A DATA ==");
// O caso de 06/10/2026: periodo salvo de 07/10 a 30/10, no dia 06/10.
const out = { ativa: true, inicio: "2026-10-07", fim: "2026-10-30", ciclo: "2026-10", titulo: "x" };
eq("comeca amanha = antes", situacaoDoPeriodo(out, "2026-10-06"), "antes");
eq("o aviso diz a data e 'amanha'",
  /07\/10\/2026 \(amanhã\)/.test(avisoDoPeriodo(out, "2026-10-06") ?? ""), true);
eq("faltando varios dias, diz quantos",
  /daqui a 6 dias/.test(avisoDoPeriodo(out, "2026-10-01") ?? ""), true);
eq("no primeiro dia ja esta no ar", situacaoDoPeriodo(out, "2026-10-07"), "no-ar");
eq("no ultimo dia ainda esta no ar", situacaoDoPeriodo(out, "2026-10-30"), "no-ar");
eq("no ar, sem aviso", avisoDoPeriodo(out, "2026-10-15"), null);
eq("depois do fim = depois", situacaoDoPeriodo(out, "2026-10-31"), "depois");
eq("o aviso do fim diz quando acabou",
  /terminou em 30\/10\/2026/.test(avisoDoPeriodo(out, "2026-10-31") ?? ""), true);
eq("desligada de proposito nao avisa",
  avisoDoPeriodo({ ...out, ativa: false }, "2026-10-06"), null);
eq("sem datas = sempre no ar",
  situacaoDoPeriodo({ ...out, inicio: null, fim: null }, "2030-01-01"), "no-ar");

console.log("\n== FIM DO CICLO ==");
eq("outubro tem 31", fimDoCiclo("2026-10"), "2026-10-31");
eq("fevereiro comum", fimDoCiclo("2027-02"), "2027-02-28");
eq("fevereiro bissexto", fimDoCiclo("2028-02"), "2028-02-29");
eq("dezembro nao vira o ano", fimDoCiclo("2026-12"), "2026-12-31");
eq("lixo da nulo", fimDoCiclo("banana"), null);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
