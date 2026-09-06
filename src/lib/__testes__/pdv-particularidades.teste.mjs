// Particularidades do PDV. O risco aqui nao e o app quebrar -- e o app
// AVISAR ERRADO: mandar o motorista tratar como bloqueado um cliente que
// ja foi liberado, ou calar sobre o que venceu. Por isso quase todo teste
// abaixo guarda um caso em que o aviso NAO deve aparecer.
//   npx tsx src/lib/__testes__/pdv-particularidades.teste.mjs
import {
  normalizarCodPdv, ehCodigoValido, chaveDeRegiao, diasAte, valeHoje, venceuEmAberto,
  valeNoDia, diaDaSemanaDe, rotuloDosDias, rotuloDoHorario, rotuloDoPrazo,
  normalizarJanelas, janelaInvertida,
  avisosDoPdv, avisosDaRegiao, pendenciasComPrazo, sugestoesDeDetrator,
} from "../pdv-particularidades.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const cat = (id, extra = {}) => ({
  id, nome: id, emoji: null, severidade: "atencao",
  exigePrazo: false, exigeHorario: false, alertaNaRota: true, ...extra,
});
const part = (id, extra = {}) => ({
  id, categoriaId: "c1", codPdv: "507", nomePdv: "BAR", cidade: "CORIBE", bairro: "CENTRO",
  aviso: "aviso", detalhe: null, janelas: [], diasSemana: null,
  de: null, ate: null, status: "ativa", ...extra,
});

console.log("\nCODIGO DO PDV");
eq("tira zeros a esquerda", normalizarCodPdv("000507"), "507");
eq("o que a pessoa digita bate com a planilha", normalizarCodPdv("507"), normalizarCodPdv("000507"));
eq("aceita codigo com letra", normalizarCodPdv("AB-12"), "12");
eq("codigo so de letras sobrevive", normalizarCodPdv("abc"), "ABC");
eq("vazio e vazio", normalizarCodPdv(null), "");
eq("zero nao vira vazio", normalizarCodPdv("000"), "0");

console.log("\nCODIGO VALIDO -- a trava que impede o PDV orfao");
eq("codigo normal", ehCodigoValido("507"), true);
eq("com zeros a esquerda", ehCodigoValido("000507"), true);
eq("um digito so", ehCodigoValido("7"), true);
// O caso que originou a trava: o nome digitado no campo do codigo.
eq("NOME NAO E CODIGO", ehCodigoValido("BAR LINHA DIRETA"), false);
eq("nome com numero tambem nao", ehCodigoValido("BAR 24 HORAS"), false);
eq("vazio nao e codigo", ehCodigoValido(""), false);
eq("so espaco nao e codigo", ehCodigoValido("   "), false);
eq("codigo absurdo de longo nao passa", ehCodigoValido("12345678901234"), false);

console.log("\nREGIAO");
eq("acento nao separa a cidade", chaveDeRegiao("São Félix"), chaveDeRegiao("SAO FELIX"));
eq("espaco dobrado nao separa", chaveDeRegiao("NOVA  COLONIA"), "NOVA COLONIA");

console.log("\nPRAZO");
eq("faltam 3 dias", diasAte("2026-09-09", "2026-09-06"), 3);
eq("vence hoje e zero", diasAte("2026-09-06", "2026-09-06"), 0);
eq("vencido e negativo", diasAte("2026-09-04", "2026-09-06"), -2);
eq("sem data nao inventa", diasAte(null, "2026-09-06"), null);
eq("rotulo de hoje", rotuloDoPrazo(0), "vence hoje");
eq("rotulo de um dia", rotuloDoPrazo(1), "falta 1 dia");
eq("rotulo de ontem", rotuloDoPrazo(-1), "venceu ontem");
eq("rotulo de vencido", rotuloDoPrazo(-3), "venceu há 3 dias");

console.log("\nVALE HOJE? -- o que NAO deve aparecer");
eq("sem prazo vale sempre", valeHoje(part("p"), "2026-09-06"), true);
eq("dentro do prazo vale", valeHoje(part("p", { de: "2026-09-01", ate: "2026-09-30" }), "2026-09-06"), true);
eq("ANTES de comecar nao vale", valeHoje(part("p", { de: "2026-09-10" }), "2026-09-06"), false);
eq("DEPOIS de terminar nao vale", valeHoje(part("p", { ate: "2026-09-05" }), "2026-09-06"), false);
eq("no ultimo dia ainda vale", valeHoje(part("p", { ate: "2026-09-06" }), "2026-09-06"), true);
eq("resolvida nao vale", valeHoje(part("p", { status: "resolvida" }), "2026-09-06"), false);

console.log("\nVENCEU E NINGUEM MEXEU -- o que o painel cobra");
eq("vencida e aberta e pendencia", venceuEmAberto(part("p", { ate: "2026-09-01" }), "2026-09-06"), true);
eq("vencida mas resolvida NAO e", venceuEmAberto(part("p", { ate: "2026-09-01", status: "resolvida" }), "2026-09-06"), false);
eq("no prazo nao e pendencia", venceuEmAberto(part("p", { ate: "2026-09-30" }), "2026-09-06"), false);
eq("sem prazo nunca vence", venceuEmAberto(part("p"), "2026-09-06"), false);

console.log("\nDIA DA SEMANA");
// 2026-09-06 e um domingo; 2026-09-07, segunda.
eq("domingo e 1", diaDaSemanaDe("2026-09-06"), 1);
eq("segunda e 2", diaDaSemanaDe("2026-09-07"), 2);
eq("sem dias marcados vale todo dia", valeNoDia(part("p"), "2026-09-06"), true);
eq("lista vazia vale todo dia", valeNoDia(part("p", { diasSemana: [] }), "2026-09-06"), true);
eq("segunda nao vale no domingo", valeNoDia(part("p", { diasSemana: [2] }), "2026-09-06"), false);
eq("segunda vale na segunda", valeNoDia(part("p", { diasSemana: [2] }), "2026-09-07"), true);
eq("rotulo de dias", rotuloDosDias([2, 4, 6]), "seg, qua e sex");
eq("um dia so", rotuloDosDias([3]), "ter");
eq("a semana inteira nao vira rotulo", rotuloDosDias([1, 2, 3, 4, 5, 6, 7]), null);

console.log("\nHORARIO -- ate quatro janelas no dia");
eq("so o fim", rotuloDoHorario([{ ate: "11:00:00" }]), "até as 11:00");
eq("faixa", rotuloDoHorario([{ de: "08:00:00", ate: "11:00:00" }]), "das 08:00 às 11:00");
eq("so o inicio", rotuloDoHorario([{ de: "14:00:00" }]), "a partir das 14:00");
eq("sem horario", rotuloDoHorario([]), null);
eq("nulo nao quebra", rotuloDoHorario(null), null);
// O caso do pedido: o cliente que fecha no almoco.
eq("duas janelas",
  rotuloDoHorario([{ de: "08:00", ate: "11:00" }, { de: "15:00", ate: "16:00" }]),
  "das 08:00 às 11:00 e das 15:00 às 16:00");
eq("tres janelas usam virgula e 'e'",
  rotuloDoHorario([{ de: "08:00", ate: "09:00" }, { de: "11:00", ate: "12:00" }, { de: "15:00", ate: "16:00" }]),
  "das 08:00 às 09:00, das 11:00 às 12:00 e das 15:00 às 16:00");
eq("fora de ordem sai em ordem",
  rotuloDoHorario([{ de: "15:00", ate: "16:00" }, { de: "08:00", ate: "11:00" }]),
  "das 08:00 às 11:00 e das 15:00 às 16:00");

console.log("\nJANELAS -- limpeza");
eq("vazia sai", normalizarJanelas([{ de: "", ate: "" }, { de: "08:00", ate: "11:00" }]).length, 1);
eq("repetida sai", normalizarJanelas([{ de: "08:00", ate: "11:00" }, { de: "08:00", ate: "11:00" }]).length, 1);
eq("corta em 4", normalizarJanelas([
  { de: "01:00" }, { de: "02:00" }, { de: "03:00" }, { de: "04:00" }, { de: "05:00" },
]).length, 4);
eq("segundos somem", normalizarJanelas([{ de: "08:00:00", ate: "11:00:00" }])[0], { de: "08:00", ate: "11:00" });
eq("janela invertida e pega", janelaInvertida({ de: "16:00", ate: "15:00" }), true);
eq("fim igual ao inicio tambem", janelaInvertida({ de: "15:00", ate: "15:00" }), true);
eq("janela normal passa", janelaInvertida({ de: "08:00", ate: "11:00" }), false);
eq("so um lado nao inverte", janelaInvertida({ ate: "11:00" }), false);

console.log("\nAVISOS DO PDV");
const categorias = new Map([
  ["c1", cat("c1", { severidade: "atencao" })],
  ["c2", cat("c2", { severidade: "critico" })],
  ["c3", cat("c3", { severidade: "info", alertaNaRota: false })],
]);
const doPdv = [
  part("a", { categoriaId: "c1" }),
  part("b", { categoriaId: "c2" }),
  part("c", { categoriaId: "c3" }),
  part("d", { categoriaId: "c1", ate: "2026-01-01" }),
];
const avisos = avisosDoPdv(doPdv, categorias, "2026-09-06");
eq("o critico vem primeiro", avisos.map((a) => a.particularidade.id), ["b", "a"]);
eq("categoria fora da rota nao vai para a rota", avisos.some((a) => a.particularidade.id === "c"), false);
eq("vencida nao aparece", avisos.some((a) => a.particularidade.id === "d"), false);
eq("quem acompanha ve a de dentro tambem",
  avisosDoPdv(doPdv, categorias, "2026-09-06", { apenasRota: false }).map((a) => a.particularidade.id),
  ["b", "a", "c"]);
eq("categoria apagada nao quebra a tela", avisosDoPdv([part("x", { categoriaId: "sumiu" })], categorias, "2026-09-06"), []);

console.log("\nAVISOS DA REGIAO -- o alerta da pre-rota");
const naRegiao = [
  part("r1", { cidade: "CORIBE", bairro: "CENTRO" }),
  part("r2", { cidade: "CORIBE", bairro: "NOVA COLONIA" }),
  part("r3", { cidade: "SANTA MARIA", bairro: "CENTRO" }),
  part("r4", { cidade: null, bairro: null }),
];
const mapa = [{ cidade: "Coribe", bairros: [{ nome: "Centro" }] }];
eq("casa cidade e bairro, com acento e caixa diferentes",
  avisosDaRegiao(naRegiao, categorias, mapa, "2026-09-06").map((a) => a.particularidade.id), ["r1"]);
eq("outra cidade nao entra",
  avisosDaRegiao(naRegiao, categorias, mapa, "2026-09-06").some((a) => a.particularidade.id === "r3"), false);
eq("sem cidade cadastrada nao entra em rota nenhuma",
  avisosDaRegiao(naRegiao, categorias, mapa, "2026-09-06").some((a) => a.particularidade.id === "r4"), false);
eq("mapa sem bairro casa pela cidade",
  avisosDaRegiao(naRegiao, categorias, [{ cidade: "CORIBE" }], "2026-09-06").map((a) => a.particularidade.id).sort(),
  ["r1", "r2"]);

console.log("\nPENDENCIAS COM PRAZO");
const comPrazo = [
  part("v1", { ate: "2026-09-10" }),
  part("v2", { ate: "2026-09-01" }),
  part("v3", { ate: "2026-09-06" }),
  part("v4", {}),
  part("v5", { ate: "2026-09-02", status: "resolvida" }),
];
const pend = pendenciasComPrazo(comPrazo, categorias, "2026-09-06");
eq("vencida primeiro, depois a mais proxima", pend.map((p) => p.particularidade.id), ["v2", "v3", "v1"]);
eq("marca a vencida", pend[0].vencida, true);
eq("hoje nao e vencida", pend[1].vencida, false);
eq("sem prazo fica fora do painel", pend.some((p) => p.particularidade.id === "v4"), false);
eq("resolvida fica fora do painel", pend.some((p) => p.particularidade.id === "v5"), false);

console.log("\nSUGESTAO DE CLIENTE DETRATOR");
const aval = [
  { codPdv: "000507", nomePdv: "BAR LINHA DIRETA", cidade: "CORIBE", nota: 1, classificacao: "detrator", motivo: "Produtos errados" },
  { codPdv: "507", nomePdv: "BAR LINHA DIRETA", cidade: "CORIBE", nota: 2, classificacao: "detrator", motivo: "Produtos errados" },
  { codPdv: "507", nomePdv: "BAR LINHA DIRETA", cidade: "CORIBE", nota: 5, classificacao: "promotor", motivo: null },
  { codPdv: "91", nomePdv: "KIT LANCHES", cidade: "SANTA MARIA", nota: 1, classificacao: "detrator", motivo: "Entrega atrasada" },
  { codPdv: "999", nomePdv: "OK", cidade: "X", nota: 5, classificacao: "promotor", motivo: null },
];
const sug = sugestoesDeDetrator(aval);
eq("so quem tem 2+ detratoras", sug.map((s) => s.codPdv), ["507"]);
eq("o mesmo PDV com e sem zeros e UM so", sug[0].avaliacoes, 3);
eq("conta as detratoras", sug[0].detratoras, 2);
eq("media com a promotora junto", sug[0].media, 2.7);
eq("acha o motivo que se repete", sug[0].motivoMaisComum, "Produtos errados");
eq("a frase ja vem pronta", sug[0].aviso, "Já avaliou 2x como detrator. O que mais se repete: produtos errados.");
eq("com minimo 1, o segundo entra", sugestoesDeDetrator(aval, 1).map((s) => s.codPdv), ["507", "91"]);
eq("base sem detrator nao sugere nada", sugestoesDeDetrator([aval[4]]), []);

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
