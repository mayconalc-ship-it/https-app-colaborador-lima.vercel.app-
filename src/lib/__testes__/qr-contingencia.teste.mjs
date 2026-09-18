// Confere as regras do QR de contingência:
//   npx tsx src/lib/__testes__/qr-contingencia.teste.mjs
import {
  LIMITES_QR,
  clienteCasa,
  codigoDigitado,
  ehEnvioId,
  formatarCnpj,
  horaDoPagamento,
  lerValor,
  validarComprovante,
  validarConfigQr,
} from "../qr-contingencia.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) falhas++;
  console.log(`  ${a === b ? "OK " : "FALHOU"}  ${nome}${a === b ? "" : `: obtido ${a}, esperado ${b}`}`);
}

const foto = (kb = 300, tipo = "image/jpeg") => ({ tamanho: kb * 1024, tipo });
const base = { codPdv: "3163", valor: null, observacao: "", fotos: [foto()] };

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

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
