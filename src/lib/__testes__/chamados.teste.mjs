// Os Chamados para Manutenção: prazo, situação, indicadores do painel e a
// validação do formulário (que é a palavra final na página pública do QR).
//   npx tsx src/lib/__testes__/chamados.teste.mjs
import {
  PRAZOS_PADRAO, TIPOS, agruparLocais, calcularIndicadores, chaveDoTexto, formatarDuracao, formatarTelefone,
  linkWhatsapp, nomeDoLocal, pct, prazoDe, problemaDaAbertura, protocolo, situacaoDoPrazo, textoDoPrazo,
} from "../chamados.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

const H = 60 * 60 * 1000;
const t0 = new Date("2026-10-05T12:00:00Z");
const depois = (horas) => new Date(t0.getTime() + horas * H);

console.log("== O FORMS ==");
eq("os 7 tipos do Forms, na ordem", TIPOS.map((t) => t.rotulo), ["Alvenaria", "Elétrica", "Hidráulica", "Jardinagem", "Limpeza", "Mobiliário", "Outros"]);

console.log("== PRAZO ==");
eq("normal = 72 h", prazoDe(t0, "normal", PRAZOS_PADRAO).toISOString(), depois(72).toISOString());
eq("risco = 4 h", prazoDe(t0, "risco", PRAZOS_PADRAO).toISOString(), depois(4).toISOString());
const aberto = (prazoH, status = "aberto", concluidoH = null) => ({
  status,
  aberto_em: t0.toISOString(),
  prazo_em: depois(prazoH).toISOString(),
  concluido_em: concluidoH === null ? null : depois(concluidoH).toISOString(),
});
eq("no começo, no prazo", situacaoDoPrazo(aberto(24), depois(1)).tipo, "no_prazo");
eq("no último quarto, vence logo", situacaoDoPrazo(aberto(24), depois(19)).tipo, "vence_logo");
eq("passou do prazo, atrasado", situacaoDoPrazo(aberto(24), depois(30)).tipo, "atrasado");
eq("aguardando material também atrasa", situacaoDoPrazo(aberto(24, "aguardando"), depois(30)).tipo, "atrasado");
eq("concluído antes, cumprido", situacaoDoPrazo(aberto(24, "concluido", 10), depois(50)).tipo, "cumprido");
eq("concluído depois, estourado", situacaoDoPrazo(aberto(24, "concluido", 30), depois(50)).tipo, "estourado");
eq("cancelado não tem prazo", situacaoDoPrazo(aberto(24, "cancelado"), depois(50)).tipo, "sem_prazo");
eq("texto do atraso", textoDoPrazo(situacaoDoPrazo(aberto(24), depois(26))), "atrasado há 2 h");

console.log("== DURAÇÃO ==");
eq("minutos", formatarDuracao(45 * 60000), "45 min");
eq("horas quebradas", formatarDuracao(2.5 * H), "2 h 30 min");
eq("horas redondas", formatarDuracao(13 * H), "13 h");
eq("um dia", formatarDuracao(24 * H), "1 dia");
eq("dias e horas", formatarDuracao(50 * H), "2 dias e 2 h");
eq("muitos dias", formatarDuracao(10 * 24 * H), "10 dias");

console.log("== PROTOCOLO, TELEFONE ==");
eq("protocolo com 4 dígitos", protocolo(42), "#0042");
eq("celular formatado", formatarTelefone("77999991234"), "(77) 99999-1234");
eq("fixo formatado", formatarTelefone("(77) 3611-2233"), "(77) 3611-2233");
eq("com +55", formatarTelefone("+55 77 99999-1234"), "(77) 99999-1234");
eq("WhatsApp do celular", linkWhatsapp("(77) 99999-1234"), "https://wa.me/5577999991234");
eq("fixo não tem WhatsApp", linkWhatsapp("(77) 3611-2233"), null);

console.log("== VALIDAÇÃO ==");
const bom = { localId: "x", tipo: "eletrica", prioridade: "normal", descricao: "Lâmpada queimada", nome: "Ana Souza", telefone: "77999991234" };
eq("pedido completo passa", problemaDaAbertura(bom), null);
ok("sem área não passa", problemaDaAbertura({ ...bom, localId: "" }) !== null);
ok("tipo inventado não passa", problemaDaAbertura({ ...bom, tipo: "pintura" }) !== null);
ok("prioridade inventada não passa", problemaDaAbertura({ ...bom, prioridade: "altissima" }) !== null);
ok("descrição de 3 letras não passa", problemaDaAbertura({ ...bom, descricao: "  oi " }) !== null);
ok("telefone sem DDD não passa", problemaDaAbertura({ ...bom, telefone: "99999-1234" }) !== null);
ok("nome vazio não passa", problemaDaAbertura({ ...bom, nome: " " }) !== null);
ok("duplicata ignora caixa, acento e espaço", chaveDoTexto("Lâmpada  QUEIMADA ") === chaveDoTexto("lampada queimada"));

console.log("== LOCAIS ==");
eq("nome com grupo", nomeDoLocal({ grupo: "Armazém", nome: "Picking" }), "Armazém · Picking");
eq("nome sem grupo", nomeDoLocal({ grupo: "", nome: "Oficina" }), "Oficina");
const grupos = agruparLocais([
  { grupo: "Armazém", nome: "A", ordem: 1 },
  { grupo: "", nome: "Oficina", ordem: 3 },
  { grupo: "Armazém", nome: "B", ordem: 2 },
  { grupo: "Portaria", nome: "Guarita", ordem: 4 },
  { grupo: "", nome: "Refeitório", ordem: 5 },
]);
eq("grupos na ordem do cadastro", grupos.map((g) => g.titulo), ["Armazém", "Demais áreas", "Portaria"]);
eq("sem grupo juntos", grupos[1].itens.map((l) => l.nome), ["Oficina", "Refeitório"]);

console.log("== INDICADORES ==");
const c = (o) => ({
  status: "concluido", tipo: "eletrica", local_nome: "Oficina", prioridade: "normal",
  aberto_em: t0.toISOString(), prazo_em: depois(24).toISOString(), atendimento_em: depois(1).toISOString(),
  concluido_em: depois(10).toISOString(), confirmacao: null, avaliacao: null, reaberturas: 0, ...o,
});
const lista = [
  c({ avaliacao: 5 }),
  c({ concluido_em: depois(30).toISOString(), reaberturas: 1, avaliacao: 3, local_nome: "Picking" }),
  c({ status: "aberto", concluido_em: null, atendimento_em: null, prazo_em: depois(2).toISOString(), tipo: "hidraulica" }),
  c({ status: "em_atendimento", concluido_em: null, prazo_em: depois(100).toISOString() }),
  c({ status: "cancelado", concluido_em: null, atendimento_em: null, tipo: "limpeza" }),
];
const ind = calcularIndicadores(lista, depois(48));
eq("total conta o cancelado", ind.total, 5);
eq("em aberto", ind.emAberto, 2);
eq("atrasado é só o aberto com prazo vencido", ind.atrasados, 1);
eq("concluídos", ind.concluidos, 2);
eq("cancelados à parte", ind.cancelados, 1);
eq("no prazo: 1 de 2", pct(ind.noPrazo), "50%");
eq("tempo médio de solução: (10 h + 30 h) / 2", ind.tempoMedioSolucaoMs, 20 * H);
eq("tempo até assumir (sem o cancelado e o não assumido)", ind.tempoMedioRespostaMs, 1 * H);
eq("reabertos: 1 de 2 concluídos", pct(ind.reabertos), "50%");
eq("nota média", ind.notaMedia, 4);
eq("por tipo, o maior primeiro", ind.porTipo[0], { chave: "Elétrica", total: 3 });
const vazio = calcularIndicadores([], t0);
ok("sem chamado nenhum, sem divisão por zero", vazio.noPrazo === null && vazio.notaMedia === null && pct(vazio.reabertos) === "—");

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
