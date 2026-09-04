/**
 * AS UNIDADES EM QUE O ARMAZÉM CONTA UM PRODUTO, e a conversão delas.
 *
 * Palete, lastro, caixa e unidade -- as quatro que a operação usa de
 * verdade (pedido do dono, 04/09/2026). Antes cada módulo tinha a sua
 * lista curta: o Abastecimento aceitava caixa e palete; o FEFO, palete,
 * caixa e unidade; o Bate Palete, caixa e unidade. Nenhum aceitava
 * lastro, que é como o pátio conta meio palete.
 *
 * ESTE ARQUIVO É A FONTE ÚNICA. Duas listas de unidade em dois módulos
 * é como elas divergem -- e divergir aqui não dá erro: dá HL diferente
 * para a mesma caixa, em telas diferentes, sem ninguém perceber.
 *
 * TUDO PASSA POR CAIXA, e isso é deliberado. O cadastro tem UM fator de
 * conversão para HL, o `fator_hecto`, que é por caixa. Então:
 *
 *   palete  -> quantidade x caixas_por_palete
 *   lastro  -> quantidade x caixas_por_lastro
 *   caixa   -> quantidade
 *   unidade -> quantidade ÷ unidades_por_caixa
 *
 * e só então x fator_hecto. Guardar um "HL por palete" e um "HL por
 * lastro" separados seria manter três números em dia em vez de um, e o
 * dia em que um deles ficasse para trás ninguém descobriria pela tela.
 */

export const UNIDADES_PRODUTO = ["palete", "lastro", "caixa", "unidade"] as const;
export type UnidadeProduto = (typeof UNIDADES_PRODUTO)[number];

/** Da maior para a menor -- é a ordem em que a operação pensa, e a ordem
 *  em que o seletor deve aparecer. */
export const ROTULO_UNIDADE_PRODUTO: Record<UnidadeProduto, string> = {
  palete: "Palete",
  lastro: "Lastro",
  caixa: "Caixa",
  unidade: "Unidade",
};

/** Para etiqueta e coluna de tabela, onde não cabe a palavra inteira. */
export const ROTULO_UNIDADE_PRODUTO_CURTO: Record<UnidadeProduto, string> = {
  palete: "plt",
  lastro: "las",
  caixa: "cx",
  unidade: "un",
};

export function ehUnidadeProduto(v: unknown): v is UnidadeProduto {
  return typeof v === "string" && (UNIDADES_PRODUTO as readonly string[]).includes(v);
}

/**
 * Os fatores do cadastro do produto (`pa_produtos`).
 *
 * Todos podem faltar, e faltar tem consequência: a unidade que depende
 * do fator ausente é RECUSADA, em vez de valer zero. Item invisível no
 * total é pior do que uma mensagem de erro -- é a mesma regra do
 * Reepack, do Abastecimento e do Bate Palete.
 */
export type FatoresDoProduto = {
  /** HL por CAIXA (`fator_hecto`). Sem ele nada vira HL. */
  fatorHecto: number | null;
  /** Caixas por palete (`caixas_pallet`). */
  caixasPallet: number | null;
  /** Caixas por lastro (`caixas_por_lastro`, migration 096). */
  caixasPorLastro: number | null;
  /** Unidades por caixa (`unidades_por_caixa`). */
  unidadesPorCaixa: number | null;
};

/** Qual fator do cadastro cada unidade exige, além do Fator Hecto. */
const FATOR_EXIGIDO: Record<UnidadeProduto, keyof FatoresDoProduto | null> = {
  palete: "caixasPallet",
  lastro: "caixasPorLastro",
  caixa: null,
  unidade: "unidadesPorCaixa",
};

/**
 * A quantidade convertida em CAIXAS -- o denominador comum de tudo.
 *
 * `null` quando o cadastro não tem o fator necessário. Quem chama
 * recusa o lançamento e usa `faltaNoCadastro()` para dizer o que falta.
 */
export function emCaixas(
  quantidade: number,
  unidade: UnidadeProduto,
  produto: FatoresDoProduto,
): number | null {
  if (!(quantidade > 0)) return null;

  switch (unidade) {
    case "caixa":
      return quantidade;
    case "palete":
      return produto.caixasPallet && produto.caixasPallet > 0
        ? quantidade * produto.caixasPallet
        : null;
    case "lastro":
      return produto.caixasPorLastro && produto.caixasPorLastro > 0
        ? quantidade * produto.caixasPorLastro
        : null;
    case "unidade":
      // Fração é o certo aqui: 6 garrafas de uma caixa de 12 são meia
      // caixa, e arredondar para 1 inventaria produto que não existe.
      return produto.unidadesPorCaixa && produto.unidadesPorCaixa > 0
        ? quantidade / produto.unidadesPorCaixa
        : null;
  }
}

/**
 * HL do item. `null` pelo mesmo motivo de `emCaixas`.
 *
 * Três casas: o HL de uma unidade solta é um número pequeno, e arredondar
 * antes da soma faria cem lançamentos de garrafa somarem zero.
 */
export function calcularHl(
  quantidade: number,
  unidade: UnidadeProduto,
  produto: FatoresDoProduto,
): number | null {
  if (produto.fatorHecto === null) return null;
  const caixas = emCaixas(quantidade, unidade, produto);
  if (caixas === null) return null;
  return Math.round(caixas * produto.fatorHecto * 1000) / 1000;
}

/**
 * Paletes equivalentes -- para somar "quanto se moveu" sem misturar
 * unidades. Item em palete conta o informado; o resto vira fração.
 *
 * Zero (e não null) quando não dá para converter: este número é um
 * indicador de volume, não um valor lançado, e uma sessão inteira sem
 * total por causa de um produto mal cadastrado seria pior.
 */
export function calcularPaletes(
  quantidade: number,
  unidade: UnidadeProduto,
  produto: FatoresDoProduto,
): number {
  if (unidade === "palete") return quantidade;
  const caixas = emCaixas(quantidade, unidade, produto);
  if (caixas === null || !produto.caixasPallet || produto.caixasPallet <= 0) return 0;
  return caixas / produto.caixasPallet;
}

/**
 * O que falta no cadastro para esta unidade -- em português, dizendo o
 * NOME do campo que o Admin precisa preencher.
 *
 * "Produto sem cadastro completo" manda a pessoa adivinhar; "não tem
 * caixas por lastro" ela leva para quem cadastra.
 */
export function faltaNoCadastro(
  unidade: UnidadeProduto,
  produto: FatoresDoProduto,
): string | null {
  if (produto.fatorHecto === null) return "Fator Hecto";

  const exigido = FATOR_EXIGIDO[unidade];
  if (!exigido) return null;

  const valor = produto[exigido];
  if (valor !== null && valor > 0) return null;

  const nome: Record<string, string> = {
    caixasPallet: "caixas por palete",
    caixasPorLastro: "caixas por lastro",
    unidadesPorCaixa: "unidades por caixa",
  };
  return nome[exigido] ?? exigido;
}

/** As unidades que ESTE produto aceita, dado o cadastro dele. */
export function unidadesDisponiveis(produto: FatoresDoProduto): UnidadeProduto[] {
  return UNIDADES_PRODUTO.filter((u) => faltaNoCadastro(u, produto) === null);
}
