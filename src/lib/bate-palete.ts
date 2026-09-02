/**
 * BATE PALETE
 *
 * O palete chega da fábrica com avaria. Alguém precisa desmontá-lo,
 * TIRAR as caixas avariadas e REPOR com caixas boas até o palete voltar a
 * ficar inteiro. É isso que a operação chama de "bater o palete".
 *
 * NÃO é a Seleção e Triagem do Repack (POP-ARM-001, migration 065), e a
 * diferença precisa ficar dita para as duas não medirem o mesmo trabalho:
 *
 *   Seleção e Triagem -> inspeciona unidade por unidade, lava, seca e
 *                        decide o que é descarte e o que é recuperável.
 *                        O produto dela é a unidade limpa.
 *   Bate palete       -> remonta o PALETE: tira o que está avariado,
 *                        completa com bom, e o palete volta para o
 *                        estoque inteiro. O produto dela é o palete.
 *
 * Um lote pode passar pelas duas. Somá-las daria um número que não
 * descreve nenhuma.
 *
 * Aqui só a matemática pura, sem banco e sem React -- é o que permite
 * conferir os números sem subir a tela.
 */

export const COOKIE_BATE_PALETE_PATH = "/produtividade-armazem/bate-palete";

/**
 * O que se sabe do produto para converter caixa em HL e em fração de
 * palete. Mesmos campos do cadastro que o Abastecimento usa.
 */
export type FatoresDoProduto = {
  /** HL por CAIXA (pa_produtos.fator_hecto). */
  fatorHecto: number | null;
  /** Caixas por palete -- é o que diz o TAMANHO do palete batido. */
  caixasPallet: number | null;
};

/**
 * HL recuperado por um palete batido.
 *
 * É o volume que VOLTOU a ser vendável: as caixas boas que entraram no
 * lugar das avariadas. `null` sem o fator no cadastro -- e aí o item é
 * recusado, em vez de entrar valendo zero e sumir do total sem ninguém
 * perceber (mesma regra do Abastecimento).
 */
export function hlRecuperado(caixasRepostas: number, produto: FatoresDoProduto): number | null {
  if (!(caixasRepostas >= 0)) return null;
  if (produto.fatorHecto === null) return null;
  return Math.round(caixasRepostas * produto.fatorHecto * 1000) / 1000;
}

/**
 * Quanto do palete estava avariado, em porcentagem.
 *
 * `null` sem "caixas por palete" no cadastro: sem saber o tamanho do
 * palete, "12 caixas avariadas" não vira porcentagem de nada. Melhor não
 * mostrar do que mostrar um número inventado.
 */
export function pctAvariaDoPalete(
  caixasAvariadas: number,
  produto: FatoresDoProduto,
): number | null {
  const total = produto.caixasPallet;
  if (total === null || total <= 0) return null;
  return Math.round((caixasAvariadas / total) * 1000) / 10;
}

// -------------------- RESUMO DA SESSÃO --------------------

export type PaleteBatido = {
  id: string;
  produtoId: string;
  caixasAvariadas: number;
  caixasRepostas: number;
  hlRecuperado: number;
};

export type ResumoBatePalete = {
  minutos: number;
  paletes: number;
  caixasAvariadas: number;
  caixasRepostas: number;
  /**
   * O que a pessoa MANUSEOU: tirou + repôs.
   *
   * É o denominador honesto do esforço. Contar só paletes trata igual um
   * palete com 3 caixas quebradas e um com 60 -- e o segundo leva o
   * turno inteiro.
   */
  caixasTratadas: number;
  hlRecuperado: number;
  /** Paletes por hora. `null` sem tempo fechado. */
  paletesPorHora: number | null;
  /** Caixas tratadas por hora -- a taxa que compara pessoas de verdade. */
  caixasPorHora: number | null;
  /** Minutos médios por palete. É como a operação fala. */
  minutosPorPalete: number | null;
};

export function resumirBatePalete(
  inicioISO: string,
  fimISO: string | null,
  itens: { caixasAvariadas: number; caixasRepostas: number; hlRecuperado: number }[],
): ResumoBatePalete {
  const fim = fimISO ? new Date(fimISO).getTime() : Date.now();
  const minutos = Math.max((fim - new Date(inicioISO).getTime()) / 60_000, 0);

  const caixasAvariadas = itens.reduce((s, i) => s + i.caixasAvariadas, 0);
  const caixasRepostas = itens.reduce((s, i) => s + i.caixasRepostas, 0);
  const caixasTratadas = caixasAvariadas + caixasRepostas;
  const hl = Math.round(itens.reduce((s, i) => s + i.hlRecuperado, 0) * 1000) / 1000;
  const horas = minutos / 60;

  return {
    minutos: Math.round(minutos * 10) / 10,
    paletes: itens.length,
    caixasAvariadas,
    caixasRepostas,
    caixasTratadas,
    hlRecuperado: hl,
    paletesPorHora:
      horas > 0 && itens.length > 0 ? Math.round((itens.length / horas) * 100) / 100 : null,
    caixasPorHora:
      horas > 0 && caixasTratadas > 0 ? Math.round((caixasTratadas / horas) * 10) / 10 : null,
    minutosPorPalete:
      itens.length > 0 ? Math.round((minutos / itens.length) * 10) / 10 : null,
  };
}

// -------------------- RANKING DE PRODUTO --------------------

export type LinhaAvariaPorProduto = {
  produtoId: string;
  paletes: number;
  caixasAvariadas: number;
  caixasRepostas: number;
  hlRecuperado: number;
  /** Média de caixas avariadas POR PALETE deste produto. É o número que
   *  aponta o problema na origem: um SKU que chega sempre com 40 caixas
   *  quebradas tem problema de paletização ou de transporte, não de
   *  armazém. */
  avariaMediaPorPalete: number;
};

export function avariaPorProduto(
  itens: { produtoId: string; caixasAvariadas: number; caixasRepostas: number; hlRecuperado: number }[],
): LinhaAvariaPorProduto[] {
  const mapa = new Map<string, { paletes: number; av: number; rep: number; hl: number }>();

  for (const i of itens) {
    const a = mapa.get(i.produtoId) ?? { paletes: 0, av: 0, rep: 0, hl: 0 };
    a.paletes += 1;
    a.av += i.caixasAvariadas;
    a.rep += i.caixasRepostas;
    a.hl += i.hlRecuperado;
    mapa.set(i.produtoId, a);
  }

  return [...mapa]
    .map(([produtoId, v]) => ({
      produtoId,
      paletes: v.paletes,
      caixasAvariadas: v.av,
      caixasRepostas: v.rep,
      hlRecuperado: Math.round(v.hl * 1000) / 1000,
      avariaMediaPorPalete: Math.round((v.av / v.paletes) * 10) / 10,
    }))
    .sort((a, b) => b.caixasAvariadas - a.caixasAvariadas);
}

// -------------------- MÉDIA POR DIA --------------------

/**
 * Média de paletes batidos por DIA COM MOVIMENTO -- dia parado não entra
 * no divisor. Um mês em que se bateu palete em 8 dias tem a média dos 8,
 * senão domingo e feriado derrubam o número de quem trabalhou.
 */
export function mediaPaletesPorDia(sessoes: { dia: string; paletes: number }[]): number | null {
  const porDia = new Map<string, number>();
  for (const s of sessoes) porDia.set(s.dia, (porDia.get(s.dia) ?? 0) + s.paletes);
  if (porDia.size === 0) return null;
  const total = [...porDia.values()].reduce((s, v) => s + v, 0);
  return Math.round((total / porDia.size) * 10) / 10;
}
