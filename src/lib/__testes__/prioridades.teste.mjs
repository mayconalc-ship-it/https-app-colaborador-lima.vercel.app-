// As prioridades dos GVs: código, motivo, datas (calendário de São Paulo) e
// o rascunho que fica no aparelho até o envio.
//   npx tsx src/lib/__testes__/prioridades.teste.mjs
import {
  codigoDoPdv, dataCurta, dataDeEntregaValida, hojeEmSaoPaulo, incluirNoRascunho, lerGvs, lerMotivos, lerRascunho, motivoLimpo,
  ordenarAchados, problemaDoItem, proximaEntrega, rotuloDoGv, somarDias, MOTIVO_MAX, MOTIVOS_PADRAO,
} from "../prioridades.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  ok(nome, bom, bom ? "" : `obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

console.log("== CÓDIGO E MOTIVO ==");
eq("zeros à frente saem", codigoDoPdv("004510"), "4510");
eq("espaço e ponto saem", codigoDoPdv(" 4.510 "), "4510");
eq("vazio não é código", codigoDoPdv(""), null);
eq("zero não é código", codigoDoPdv("000"), null);
eq("texto sem número não é código", codigoDoPdv("abc"), null);
eq("motivo com espaços repetidos", motivoLimpo("  cliente   sem   estoque "), "cliente sem estoque");
eq("motivo corta no máximo", motivoLimpo("x".repeat(500)).length, MOTIVO_MAX);
ok("sem código: pede o código", /código/.test(problemaDoItem("", "sem estoque")));
ok("sem motivo: pede o motivo", /motivo/.test(problemaDoItem("4510", " ")));
eq("código e motivo bons", problemaDoItem("4510", "sem estoque"), null);

console.log("== DATAS ==");
eq("hoje em São Paulo às 22h de terça (UTC já é quarta)", hojeEmSaoPaulo(new Date("2026-11-04T01:00:00Z")), "2026-11-03");
eq("somar dias atravessa o mês", somarDias("2026-10-31", 1), "2026-11-01");
eq("próxima entrega de terça é quarta", proximaEntrega("2026-11-03"), "2026-11-04");
eq("próxima entrega de sexta é sábado", proximaEntrega("2026-11-06"), "2026-11-07");
eq("próxima entrega de sábado pula o domingo", proximaEntrega("2026-11-07"), "2026-11-09");
ok("hoje vale", dataDeEntregaValida("2026-11-03", "2026-11-03"));
ok("ontem não vale", !dataDeEntregaValida("2026-11-02", "2026-11-03"));
ok("duas semanas vale", dataDeEntregaValida("2026-11-17", "2026-11-03"));
ok("15 dias não vale", !dataDeEntregaValida("2026-11-18", "2026-11-03"));
ok("31/11 não existe", !dataDeEntregaValida("2026-11-31", "2026-11-03"));
eq("data curta", dataCurta("2026-11-04"), "qua 04/11");

console.log("== GVs ==");
eq("lista torta vira vazia", lerGvs(null), []);
eq("nome vazio sai, código vazio vira nulo", lerGvs([{ codigo: "1", nome: " Kenio  Saimon " }, { codigo: "2", nome: "" }, { nome: "Fulano" }]), [
  { codigo: "1", nome: "Kenio Saimon" },
  { codigo: null, nome: "Fulano" },
]);
eq("rótulo com código", rotuloDoGv({ codigo: "1", nome: "Kenio" }), "GV 1 · Kenio");
eq("rótulo sem código", rotuloDoGv({ codigo: null, nome: "Kenio" }), "Kenio");

console.log("== MOTIVOS E BUSCA ==");
eq("sem lista no banco: a padrão", lerMotivos([]), MOTIVOS_PADRAO);
eq("lista torta: a padrão", lerMotivos(null), MOTIVOS_PADRAO);
eq("repetido e curto saem", lerMotivos([" Cliente  sem estoque", "cliente sem estoque", "ok", "Evento"]), ["Cliente sem estoque", "Evento"]);
eq(
  "o código exato primeiro, depois os mais curtos",
  ordenarAchados([{ cod: "45100" }, { cod: "4519" }, { cod: "451" }, { cod: "4510" }], 3).map((a) => a.cod),
  ["451", "4510", "4519"],
);

console.log("== RASCUNHO ==");
let r = incluirNoRascunho([], { cod: "4510", motivo: "sem estoque", nome: "Bar A" });
r = incluirNoRascunho(r.lista, { cod: "4825", motivo: "fechamento", nome: null });
eq("o mais novo em cima", r.lista.map((i) => i.cod), ["4825", "4510"]);
const troca = incluirNoRascunho(r.lista, { cod: "4510", motivo: "evento no fim de semana", nome: "Bar A" });
ok("mesmo PDV troca o motivo, não duplica", troca.substituiu && troca.lista.length === 2 && troca.lista[1].motivo === "evento no fim de semana");
eq("rascunho guardado torto é limpo", lerRascunho([{ cod: "0130", motivo: "ok ok" }, { cod: "130", motivo: "repetido" }, { cod: "", motivo: "x" }, "lixo"]), [
  { cod: "130", motivo: "ok ok", nome: null },
]);
eq("rascunho que não é lista", lerRascunho({}), []);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
