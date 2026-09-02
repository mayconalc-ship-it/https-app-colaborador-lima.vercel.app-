/**
 * BATE PALETE
 *
 * O palete chega da fábrica com avaria. Alguém precisa desmontá-lo,
 * separar o que está avariado e remontar o palete. É isso que a operação
 * chama de "bater o palete".
 *
 * Registra-se O QUE FOI BATIDO (produto e quantidade) e, dentro disso,
 * QUANTO ESTAVA AVARIADO -- duas medidas do mesmo lote, não duas pilhas
 * separadas. É essa dupla que produz o número que interessa: o
 * PERCENTUAL DE AVARIA, que aponta problema na origem.
 *
 * NÃO é a Seleção e Triagem do Repack (POP-ARM-001, migration 065), e a
 * diferença precisa ficar dita para as duas não medirem o mesmo trabalho:
 *
 *   Seleção e Triagem -> inspeciona unidade por unidade, lava, seca e
 *                        decide o que é descarte. O produto dela é a
 *                        unidade limpa.
 *   Bate palete       -> remonta o PALETE e devolve inteiro ao estoque.
 *                        O produto dela é o palete.
 *
 * Aqui só a matemática pura, sem banco e sem React.
 */

export const COOKIE_BATE_PALETE_PATH = "/produtividade-armazem/bate-palete";

export const UNIDADES_BATE_PALETE = ["caixa", "unidade"] as const;
export type UnidadeBatePalete = (typeof UNIDADES_BATE_PALETE)[number];

export const ROTULO_UNIDADE_BATE_PALETE: Record<UnidadeBatePalete, string> = {
  caixa: "Caixa",
  unidade: "Unidade",
};

export function ehUnidadeBatePalete(v: unknown): v is UnidadeBatePalete {
  return typeof v === "string" && (UNIDADES_BATE_PALETE as readonly string[]).includes(v);
}

/**
 * O que o cadastro precisa ter para converter em HL.
 *
 * `unidadesPorCaixa` só é necessário quando se conta em UNIDADE -- é o
 * que traduz garrafa solta para caixa antes de aplicar o fator.
 */
export type FatoresDoProduto = {
  /** HL por CAIXA (pa_produtos.fator_hecto). */
  fatorHecto: number | null;
  /** Unidades por caixa (pa_produtos.unidades_por_caixa). */
  unidadesPorCaixa: number | null;
  /** Caixas por palete -- só para dizer o tamanho do palete. */
  caixasPallet: number | null;
};

/**
 * HL de uma quantidade, na unidade informada.
 *
 * `null` quando o cadastro não tem o fator necessário -- e aí o item é
 * RECUSADO na ação, em vez de entrar valendo zero e sumir do total sem
 * ninguém perceber (mesma regra do Abastecimento e do Reepack).
 *
 * Unidade passa por caixa de propósito: o fator do cadastro é por caixa,
 * então unidade = (quantidade ÷ unidades_por_caixa) × fator_hecto.
 * Guardar um "HL por unidade" separado seria um segundo número para
 * manter em dia.
 */
export function calcularHl(
  quantidade: number,
  unidade: UnidadeBatePalete,
  produto: FatoresDoProduto,
): number | null {
  if (!(quantidade >= 0)) return null;
  if (produto.fatorHecto === null) return null;

  const caixas =
    unidade === "unidade"
      ? produto.unidadesPorCaixa !== null && produto.unidadesPorCaixa > 0
        ? quantidade / produto.unidadesPorCaixa
        : null
      : quantidade;

  if (caixas === null) return null;
  return Math.round(caixas * produto.fatorHecto * 1000) / 1000;
}

/**
 * Quanto do lote estava avariado, em porcentagem.
 *
 * É O número deste módulo. Um SKU que chega com 30% de avaria em todo
 * lote tem problema de paletização ou de transporte, e nenhuma melhoria
 * dentro do armazém resolve isso.
 *
 * `null` sem lote (divisão por zero) -- e não zero, que afirmaria que o
 * lote veio perfeito.
 */
export function pctAvaria(batida: number, avariada: number): number | null {
  if (!(batida > 0)) return null;
  return Math.round((avariada / batida) * 1000) / 10;
}

// -------------------- RESUMO DA SESSÃO --------------------

export type ResumoBatePalete = {
  minutos: number;
  /** Quantos lançamentos -- cada um é um lote batido. */
  lotes: number;
  hlBatido: number;
  hlAvariado: number;
  /** O que sobrou bom: batido menos avariado. */
  hlAproveitado: number;
  pctAvaria: number | null;
  /** HL batido por hora -- a taxa que compara ritmo. `null` sem tempo. */
  hlPorHora: number | null;
  minutosPorLote: number | null;
};

export function resumirBatePalete(
  inicioISO: string,
  fimISO: string | null,
  itens: { hlBatido: number; hlAvariado: number }[],
): ResumoBatePalete {
  const fim = fimISO ? new Date(fimISO).getTime() : Date.now();
  const minutos = Math.max((fim - new Date(inicioISO).getTime()) / 60_000, 0);

  const hlBatido = Math.round(itens.reduce((s, i) => s + i.hlBatido, 0) * 1000) / 1000;
  const hlAvariado = Math.round(itens.reduce((s, i) => s + i.hlAvariado, 0) * 1000) / 1000;
  const horas = minutos / 60;

  return {
    minutos: Math.round(minutos * 10) / 10,
    lotes: itens.length,
    hlBatido,
    hlAvariado,
    hlAproveitado: Math.round((hlBatido - hlAvariado) * 1000) / 1000,
    pctAvaria: pctAvaria(hlBatido, hlAvariado),
    hlPorHora: horas > 0 && hlBatido > 0 ? Math.round((hlBatido / horas) * 100) / 100 : null,
    minutosPorLote: itens.length > 0 ? Math.round((minutos / itens.length) * 10) / 10 : null,
  };
}

// -------------------- AVARIA POR PRODUTO --------------------

export type LinhaAvariaPorProduto = {
  produtoId: string;
  lotes: number;
  hlBatido: number;
  hlAvariado: number;
  /** O percentual do PRODUTO no período -- somando os lotes antes de
   *  dividir. Média de porcentagens daria peso igual a um lote de 2
   *  caixas e a um de 200. */
  pctAvaria: number | null;
};

export function avariaPorProduto(
  itens: { produtoId: string; hlBatido: number; hlAvariado: number }[],
): LinhaAvariaPorProduto[] {
  const mapa = new Map<string, { lotes: number; batido: number; avariado: number }>();

  for (const i of itens) {
    const a = mapa.get(i.produtoId) ?? { lotes: 0, batido: 0, avariado: 0 };
    a.lotes += 1;
    a.batido += i.hlBatido;
    a.avariado += i.hlAvariado;
    mapa.set(i.produtoId, a);
  }

  return [...mapa]
    .map(([produtoId, v]) => ({
      produtoId,
      lotes: v.lotes,
      hlBatido: Math.round(v.batido * 1000) / 1000,
      hlAvariado: Math.round(v.avariado * 1000) / 1000,
      pctAvaria: pctAvaria(v.batido, v.avariado),
    }))
    // Pelo VOLUME de avaria, não pelo percentual: um lote único com 100%
    // de avaria lideraria a lista para sempre, e o problema grande está
    // onde há muito HL perdido, não onde houve um caso extremo.
    .sort((a, b) => b.hlAvariado - a.hlAvariado);
}

// -------------------- MÉDIA POR DIA --------------------

/**
 * Média de HL batido por DIA COM MOVIMENTO -- dia parado não entra no
 * divisor. Um mês em que se bateu palete em 8 dias tem a média dos 8,
 * senão domingo e feriado derrubam o número de quem trabalhou.
 */
export function mediaHlPorDia(sessoes: { dia: string; hl: number }[]): number | null {
  const porDia = new Map<string, number>();
  for (const s of sessoes) porDia.set(s.dia, (porDia.get(s.dia) ?? 0) + s.hl);
  if (porDia.size === 0) return null;
  const total = [...porDia.values()].reduce((s, v) => s + v, 0);
  return Math.round((total / porDia.size) * 100) / 100;
}
