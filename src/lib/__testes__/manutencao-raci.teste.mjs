// Base de fornecedores e RACI da manutenção (DPO 2.2, V.3 e V.4).
//   npx tsx src/lib/__testes__/manutencao-raci.teste.mjs
import {
  linkTelefone, linkWhatsapp, formatarTelefone, problemaDoFornecedor, buscarFornecedores,
  pendenciasDoFornecedor, proximaLetra, problemasDaAtividade, situacaoDaRevisao, raciVigente, dataBr,
} from "../manutencao-raci.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}

console.log("== TELEFONES (como vieram da planilha) ==");
ok("celular com DDD liga com +55", linkTelefone("77 99802-7417") === "tel:+5577998027417");
ok("celular vira WhatsApp", linkWhatsapp("77 99802-7417") === "https://wa.me/5577998027417");
ok("hífen fora do lugar: (77)9812-04881", linkWhatsapp("(77)9812-04881") === "https://wa.me/5577981204881");
ok("outro DDD: (61)9960-91556", linkWhatsapp("(61)9960-91556") === "https://wa.me/5561996091556");
ok("fixo liga, mas sem WhatsApp", linkTelefone("77 3612-9300") === "tel:+557736129300" && linkWhatsapp("77 3612-9300") === null);
ok("190 liga direto, sem +55", linkTelefone("190") === "tel:190" && linkWhatsapp("190") === null);
ok("número faltando dígito não vira WhatsApp", linkWhatsapp("77 9905-1020") === null);
ok("já com 55 na frente", linkWhatsapp("+55 77 99802-7417") === "https://wa.me/5577998027417");
ok("vazio não vira link", linkTelefone("") === null && linkTelefone("ab") === null);
ok("formata celular", formatarTelefone("77998027417") === "(77) 99802-7417");
ok("formata fixo", formatarTelefone("7736129300") === "(77) 3612-9300");
ok("190 fica 190", formatarTelefone(" 190 ") === "190");

console.log("== CADASTRO ==");
const base = { nome: "Tec Clima", telefone: "77 99802-7417", tipoServico: "Ar-condicionado", categoria: "manutencao" };
ok("completo passa", problemaDoFornecedor(base) === null);
ok("sem nome", problemaDoFornecedor({ ...base, nome: " " }) !== null);
ok("categoria inventada", problemaDoFornecedor({ ...base, categoria: "x" }) !== null);
ok("sem telefone", problemaDoFornecedor({ ...base, telefone: "-" }) !== null);
ok("sem serviço", problemaDoFornecedor({ ...base, tipoServico: "" }) !== null);
ok("telefone curto de emergência vale", problemaDoFornecedor({ ...base, telefone: "193" }) === null);

console.log("== BUSCA ==");
const lista = [
  { nome: "TEC CLIMA AR-CONDICIONADO", tipoServico: "Conserto de ar-condicionado", cidade: "Barreiras", telefone: "77 99802-7417" },
  { nome: "CASA DA REFRIGERAÇÃO", tipoServico: "Conserto de ar-condicionado", cidade: "Barreiras", telefone: "77 99161-0043" },
  { nome: "HOTEL LIMA", tipoServico: "Hotel/Restaurante", cidade: "Luís Eduardo Magalhães", telefone: "(77)9812-04881" },
];
ok("sem termo, todos", buscarFornecedores(lista, "  ").length === 3);
ok("sem acento acha com acento", buscarFornecedores(lista, "refrigeracao").length === 1);
ok("várias palavras: todas precisam bater", buscarFornecedores(lista, "ar barreiras").length === 2);
ok("cidade com acento", buscarFornecedores(lista, "luis eduardo")[0]?.nome === "HOTEL LIMA");
ok("pelo telefone", buscarFornecedores(lista, "99161")[0]?.nome === "CASA DA REFRIGERAÇÃO");

console.log("== ROTINA DOS CRÍTICOS ==");
ok("crítico sem ANS acusa", pendenciasDoFornecedor({ critico: true, ans: " ", situacaoAns: "em_dia" }).length === 1);
ok("não crítico sem ANS não acusa", pendenciasDoFornecedor({ critico: false, ans: null, situacaoAns: "em_dia" }).length === 0);
ok("ANS a revisar acusa", pendenciasDoFornecedor({ critico: true, ans: "4 h", situacaoAns: "revisar" }).length === 1);

console.log("== RACI ==");
const ciclo = [null];
for (let i = 0; i < 5; i++) ciclo.push(proximaLetra(ciclo[ciclo.length - 1]));
ok("toque: – R A C I –", ciclo.map((l) => l ?? "–").join(" ") === "– R A C I –");
ok("R + A está certo", problemasDaAtividade(["R", "A", "I", null]).length === 0);
ok("sem A", problemasDaAtividade(["R", "C"]).join() === "Sem A (quem responde pelo resultado)");
ok("dois A", problemasDaAtividade(["R", "A", "A"])[0]?.startsWith("2 pessoas com A"));
ok("sem R", problemasDaAtividade(["A", "C"]).join() === "Sem R (quem executa)");
ok("linha vazia: sem A e sem R", problemasDaAtividade([null, undefined]).length === 2);

console.log("== VIGÊNCIA ==");
ok("nunca revisada", situacaoDaRevisao(null, "2026-10-02").tipo === "nunca");
const hoje = situacaoDaRevisao("2026-10-02", "2026-10-02");
ok("revista hoje vale 90 dias", hoje.tipo === "em_dia" && hoje.dias === 90 && hoje.venceEm === "2026-12-31");
const ultimo = situacaoDaRevisao("2026-07-04", "2026-10-02");
ok("no 90º dia ainda vale", ultimo.tipo === "em_dia" && ultimo.dias === 0);
const venceu = situacaoDaRevisao("2026-07-03", "2026-10-02");
ok("no 91º dia venceu", venceu.tipo === "vencida" && venceu.dias === 1);
ok("aceita timestamp", situacaoDaRevisao("2026-09-01T23:59:00-03:00", "2026-10-02").tipo === "em_dia");
ok("vigente = em dia e sem problema", raciVigente(hoje, 0) && !raciVigente(hoje, 1) && !raciVigente(venceu, 0));
ok("data em pt-BR", dataBr("2026-10-02") === "02/10/2026" && dataBr(null) === "—");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
