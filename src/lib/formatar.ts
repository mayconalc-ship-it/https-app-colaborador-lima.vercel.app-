// Local de proposito: este arquivo cuida so de formatacao e nao deve
// depender da leitura de planilha.
export function normalizarTexto(texto: string) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Converte o texto vindo da planilha em numero. Precisa aguentar as duas
 * convencoes: brasileira ("1.200,50") e a que o Excel entrega crua ("1200.5").
 */
export function paraNumero(bruto: string): number | null {
  if (bruto === null || bruto === undefined) return null;

  const limpo = String(bruto)
    .replace(/R\$/gi, "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .trim();

  if (limpo === "" || limpo === "-") return null;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  let normalizado = limpo;

  if (temVirgula && temPonto) {
    // "1.200,50" -> ponto e milhar, virgula e decimal
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    normalizado = limpo.replace(",", ".");
  } else if (temPonto) {
    // Só ponto: pode ser milhar ("1.200") ou decimal ("1200.5" / "0.005").
    // Só é milhar quando TODOS os grupos seguintes têm 3 dígitos e o
    // primeiro não começa com zero — senão "0.005" viraria 5.
    const ehMilhar = /^[1-9]\d{0,2}(\.\d{3})+$/.test(limpo);
    normalizado = ehMilhar ? limpo.replace(/\./g, "") : limpo;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatarPercentual(valor: number) {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatarNumero(valor: number) {
  // Quantidades inteiras continuam inteiras; o resto ganha 2 casas.
  const casas = Number.isInteger(valor) ? 0 : 2;
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export type TipoColuna = "moeda" | "percentual" | "numero" | "texto";

/**
 * Descobre o tipo pela coluna. A ordem importa: "RV com % (de 5% de
 * absenteismo)" tem "%" no nome mas e dinheiro, entao dinheiro vem antes.
 */
export function tipoDaColuna(rotulo: string): TipoColuna {
  const nome = normalizarTexto(rotulo);

  if (/(valor|rv|total|r\$|premio|liquido|bruto)/.test(nome)) return "moeda";
  if (nome.includes("%") || nome.includes("percent")) return "percentual";
  if (/^(qt|qtd|quantidade|n[°º]|num)/.test(nome)) return "numero";

  return "texto";
}

export function formatarCelula(rotulo: string, bruto: string): string {
  const tipo = tipoDaColuna(rotulo);
  if (tipo === "texto") return bruto;

  const n = paraNumero(bruto);
  if (n === null) return bruto;

  if (tipo === "moeda") return formatarMoeda(n);

  if (tipo === "percentual") {
    // O Excel guarda porcentagem como fracao (0,0125 = 1,25%). Se o texto
    // original nao trazia "%", e o numero e menor que 1, assumimos fracao.
    const jaEstaEmPercentual = String(bruto).includes("%") || Math.abs(n) >= 1;
    return formatarPercentual(jaEstaEmPercentual ? n : n * 100);
  }

  return formatarNumero(n);
}

/**
 * Colunas que existem na planilha mas nao interessam ao colaborador.
 * Ficam fora da tela sem precisar mexer no arquivo da operacao.
 */
const COLUNAS_OCULTAS = ["obs", "tt", "observacao", "observacoes"];

export function deveOcultarColuna(rotulo: string) {
  return COLUNAS_OCULTAS.includes(normalizarTexto(rotulo));
}

/**
 * Nomes por extenso: na planilha os titulos vem abreviados, mas na tela do
 * colaborador precisam ser autoexplicativos.
 */
const APELIDOS: { casaCom: (nome: string) => boolean; rotulo: string }[] = [
  {
    casaCom: (n) => n.startsWith("rv s/") || n.startsWith("rv sem"),
    rotulo: "RV sem % de Absenteísmo",
  },
  {
    casaCom: (n) => n.startsWith("rv c/") || n.startsWith("rv com"),
    rotulo: "RV com % de Absenteísmo",
  },
];

export function rotuloExibido(rotulo: string) {
  const nome = normalizarTexto(rotulo);
  return APELIDOS.find((a) => a.casaCom(nome))?.rotulo ?? rotulo;
}
