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

  // "remuneracao", "bonus" e "adicional" vieram com a RV de Barreiras
  // (10/09/2026): "Remuneração sem %" tem "%" no nome e aparecia como
  // "870,81%".
  if (/(valor|rv|total|r\$|premio|liquido|bruto|remuneracao|bonus|adicional)/.test(nome)) return "moeda";
  if (nome.includes("%") || nome.includes("percent")) return "percentual";
  if (/^(qt|qtd|quantidade|n[°º]|num)/.test(nome)) return "numero";

  return "texto";
}

export function formatarCelula(rotulo: string, bruto: string): string {
  const tipo = tipoDaColuna(rotulo);
  if (tipo === "texto") {
    // Número cru do Excel numa coluna de título qualquer ("Tempo de
    // Empresa", "Ajudante 1", "TML") chegava como "2.254794520547945".
    // Número com casa decimal ganha o formato brasileiro; texto de verdade
    // e número inteiro (matrícula, código) seguem como vieram.
    if (/^-?\d+[.,]\d+$/.test(bruto.trim())) {
      const n = paraNumero(bruto);
      if (n !== null) return formatarNumero(n);
    }
    return bruto;
  }

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
  const nome = normalizarTexto(rotulo);
  // Título sem letra nem número ("\", "-", "#") é coluna de controle -- na
  // RV de Barreiras, a que numera as linhas.
  if (!/[a-z0-9]/.test(nome)) return true;
  return COLUNAS_OCULTAS.includes(nome);
}

/**
 * Nomes por extenso: na planilha os titulos vem abreviados, mas na tela do
 * colaborador precisam ser autoexplicativos.
 */
const APELIDOS: { casaCom: (nome: string) => boolean; rotulo: string }[] = [
  // A mesma régua estrita da escada (rv-contracheque): "RV C/ bonus
  // devolução %", de Barreiras, não é o "RV com %" de absenteísmo.
  {
    casaCom: (n) => /^rv (s\/|sem) ?%$/.test(n.replace(/\s+/g, " ")),
    rotulo: "RV sem % de Absenteísmo",
  },
  {
    casaCom: (n) => /^rv (c\/|com) ?%$/.test(n.replace(/\s+/g, " ")),
    rotulo: "RV com % de Absenteísmo",
  },
];

export function rotuloExibido(rotulo: string) {
  const nome = normalizarTexto(rotulo);
  return APELIDOS.find((a) => a.casaCom(nome))?.rotulo ?? rotulo;
}
