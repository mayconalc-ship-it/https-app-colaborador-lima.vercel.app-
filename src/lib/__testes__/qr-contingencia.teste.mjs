// Confere as regras do QR de contingência:
//   npx tsx src/lib/__testes__/qr-contingencia.teste.mjs
import {
  LIMITES_QR,
  clienteCasa,
  codigoDigitado,
  digitosDoValor,
  mostrarDigitosEmReais,
  valorDosDigitos,
  ehEnvioId,
  formatarCnpj,
  horaDoPagamento,
  lerValor,
  validarComprovante,
  validarConfigQr,
  validarConferencia,
  lerNotas,
  numeroDaNf,
} from "../qr-contingencia.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) falhas++;
  console.log(`  ${a === b ? "OK " : "FALHOU"}  ${nome}${a === b ? "" : `: obtido ${a}, esperado ${b}`}`);
}

const foto = (kb = 300, tipo = "image/jpeg") => ({ tamanho: kb * 1024, tipo });
const base = { codPdv: "3163", valor: 152.4, observacao: "", fotos: [foto()] };

console.log("== COMPROVANTE ==");
eq("certo com uma foto", validarComprovante(base), null);
eq("sem cliente", validarComprovante({ ...base, codPdv: "" }), "Escolha o cliente que está pagando.");
eq("sem foto: obrigatória", validarComprovante({ ...base, fotos: [] }), "Tire a foto do comprovante — ela é obrigatória.");
eq("várias fotos", validarComprovante({ ...base, fotos: [foto(), foto(), foto(), foto(), foto()] }), null);
eq("fotos demais", validarComprovante({ ...base, fotos: Array.from({ length: LIMITES_QR.fotosMax + 1 }, () => foto(10)) }) !== null, true);
eq("foto que não foi reduzida", validarComprovante({ ...base, fotos: [foto(3500)] }) !== null, true);
eq("envio acima do limite", validarComprovante({ ...base, fotos: [foto(2000), foto(2000), foto(500)] }) !== null, true);
eq("arquivo que não é foto", validarComprovante({ ...base, fotos: [foto(100, "application/pdf")] }) !== null, true);
eq("valor inválido", validarComprovante({ ...base, valor: NaN }), "Valor inválido. Use números, por exemplo 150,00.");
eq("valor zero", validarComprovante({ ...base, valor: 0 }), "O valor precisa ser maior que zero.");
eq("sem valor: obrigatório", validarComprovante({ ...base, valor: null }), "Informe o valor pago.");

console.log("\n== CAMPO DE VALOR (teclado numérico, centavos pela direita) ==");
eq("1-5-2-4-0 vira 152,40", valorDosDigitos(digitosDoValor("15240")), "152,40");
eq("um dígito: 5 centavos", valorDosDigitos(digitosDoValor("5")), "0,05");
eq("vazio", valorDosDigitos(digitosDoValor("")), "");
eq("apagando a máscara 'R$ 152,4' (backspace)", valorDosDigitos(digitosDoValor("R$ 152,4")), "15,24");
eq("mostra em reais", mostrarDigitosEmReais("15240").replace(/\s/g, " "), "R$ 152,40");
eq("valor chega ao servidor certo", lerValor(valorDosDigitos("15240")), 152.4);

console.log("\n== VALOR DIGITADO ==");
eq("vazio", lerValor(""), null);
eq("150", lerValor("150"), 150);
eq("150,50", lerValor("150,50"), 150.5);
eq("1.234,56", lerValor("1.234,56"), 1234.56);
eq("R$ 89,90", lerValor("R$ 89,90"), 89.9);
eq("150.5 (ponto decimal)", lerValor("150.5"), 150.5);
eq("lixo", Number.isNaN(lerValor("abc")), true);
eq("três casas", Number.isNaN(lerValor("10,555")), true);

console.log("\n== BUSCA DE CLIENTE ==");
const cli = { codPdv: "3163", nome: "Mercadinho São José", cidade: "Coribe", bairro: "Centro" };
eq("por código", clienteCasa(cli, "3163"), true);
eq("por nome sem acento", clienteCasa(cli, "sao jose"), true);
eq("por pedaços", clienteCasa(cli, "merc coribe"), true);
eq("não casa", clienteCasa(cli, "padaria"), false);

console.log("\n== CONFIGURAÇÃO ==");
const cfg = { temQr: true, favorecido: "", cnpj: "54.751.517/0002-22", chavePix: "", instrucoes: "" };
eq("certa", validarConfigQr(cfg), null);
eq("sem imagem do QR", validarConfigQr({ ...cfg, temQr: false }) !== null, true);
eq("CNPJ curto", validarConfigQr({ ...cfg, cnpj: "5475151700022" }), "O CNPJ precisa ter 14 dígitos.");
eq("CNPJ formatado", formatarCnpj("54751517000222"), "54.751.517/0002-22");

console.log("\n== MODO SEM INTERNET ==");
const agora = new Date("2026-09-18T15:00:00Z");
eq("hora de 2 h atrás vale", horaDoPagamento("2026-09-18T13:00:00Z", agora).toISOString(), "2026-09-18T13:00:00.000Z");
eq("de 3 dias atrás vale", horaDoPagamento("2026-09-15T13:00:00Z", agora).toISOString(), "2026-09-15T13:00:00.000Z");
eq("de 8 dias atrás: usa agora", horaDoPagamento("2026-09-10T13:00:00Z", agora).toISOString(), agora.toISOString());
eq("do futuro: usa agora", horaDoPagamento("2026-09-18T16:00:00Z", agora).toISOString(), agora.toISOString());
eq("5 min adiantado vale", horaDoPagamento("2026-09-18T15:05:00Z", agora).toISOString(), "2026-09-18T15:05:00.000Z");
eq("lixo: usa agora", horaDoPagamento("ontem", agora).toISOString(), agora.toISOString());
eq("id de envio válido", ehEnvioId("3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f"), true);
eq("id de envio inválido", ehEnvioId("1; drop table"), false);
eq("código digitado", codigoDigitado(" 0003163 "), "3163");

// As notas fiscais (21/09/2026).
eq("NF tira zeros e letras", numeroDaNf("NF 000.123-4"), "1234");
eq("várias NFs, sem repetir", lerNotas(["123", "0123", "456"]), ["123", "456"]);
eq("NFs coladas num campo só", lerNotas(["789, 790; 791"]), ["789", "790", "791"]);
eq("NF vazia some", lerNotas(["", "000"]), []);
const baseNf = { codPdv: "10", valor: 50, observacao: "", fotos: [{ tamanho: 1000, tipo: "image/jpeg" }] };
eq("sem NF vale", validarComprovante(baseNf), null);
eq("com NFs vale", validarComprovante({ ...baseNf, notas: ["123", "456"] }), null);
eq("NF torta recusada", validarComprovante({ ...baseNf, notas: ["12a"] }), "Número de NF inválido — use só os números da nota.");
eq("21 NFs recusadas", validarComprovante({ ...baseNf, notas: Array.from({ length: 21 }, (_, i) => String(i + 1)) }), "No máximo 20 notas fiscais por comprovante.");

// A conciliação com o extrato (19/09/2026).
const conc = (d) => validarConferencia({ qtd: 1, situacao: "divergente", valorExtrato: 10, motivo: "Não caiu", ...d });
eq("conferir em lote vale", validarConferencia({ qtd: 40, situacao: "conferido", valorExtrato: null, motivo: "" }), null);
eq("desfazer vale", validarConferencia({ qtd: 3, situacao: null, valorExtrato: null, motivo: "" }), null);
eq("nenhum escolhido", validarConferencia({ qtd: 0, situacao: "conferido", valorExtrato: null, motivo: "" }), "Nenhum comprovante escolhido.");
eq("divergência completa vale", conc({}), null);
eq("divergência com extrato 0 vale", conc({ valorExtrato: 0 }), null);
eq("divergência em lote não", conc({ qtd: 2 }), "Divergência é um comprovante por vez.");
eq("divergência sem valor do extrato", conc({ valorExtrato: null }), "Informe o valor que caiu no extrato (0 se não caiu).");
eq("divergência sem motivo", conc({ motivo: "  " }), "Diga o motivo da divergência.");
eq("divergência com valor torto", conc({ valorExtrato: NaN }), "Valor do extrato inválido.");

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
