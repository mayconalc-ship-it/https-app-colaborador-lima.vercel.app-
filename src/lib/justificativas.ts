/**
 * JUSTIFICATIVAS — a voz do colaborador nos três indicadores.
 *
 * Rating, Devolução e Refugo cada um guarda a explicação na sua própria
 * tabela, com a sua própria chave (avaliação, dia, aferição). Aqui elas
 * viram uma lista só, para a liderança ler num lugar em vez de três.
 *
 * Só forma e ordenação; a leitura do banco fica na tela.
 */

export const INDICADORES = ["rating", "devolucao", "refugo"] as const;
export type IndicadorId = (typeof INDICADORES)[number];

export const ROTULO_INDICADOR: Record<IndicadorId, string> = {
  rating: "Rating",
  devolucao: "Devolução",
  refugo: "Refugo",
};

export const EMOJI_INDICADOR: Record<IndicadorId, string> = {
  rating: "⭐",
  devolucao: "↩️",
  refugo: "♻️",
};

export function ehIndicador(v: string | undefined): v is IndicadorId {
  return !!v && (INDICADORES as readonly string[]).includes(v);
}

/**
 * Uma explicação, já achatada.
 *
 * `contexto` é o que a pessoa estava explicando, em texto curto — a nota
 * e o cliente no Rating, o % do dia na Devolução, o mapa e o item no
 * Refugo. Sem isso a lista seria um monte de desabafo sem o fato ao lado,
 * e ler dez delas não diria nada.
 */
export type Justificativa = {
  id: string;
  indicador: IndicadorId;
  data: string;
  colaboradorId: string;
  colaboradorNome: string;
  papel: string;
  texto: string;
  criadoEm: string;
  contexto: string;
  /** Marca o caso grave: detrator no Rating, dia acima da meta na
   *  Devolução, aferição destoante no Refugo. É por onde a liderança
   *  começa a leitura. */
  grave: boolean;
};

/** Mais recentes primeiro -- pela data do FATO, não pela do envio: uma
 *  explicação escrita hoje sobre ontem pertence a ontem na leitura. */
export function ordenarPorFato(lista: Justificativa[]): Justificativa[] {
  return [...lista].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return a.criadoEm < b.criadoEm ? 1 : -1;
  });
}

export function contarPorIndicador(lista: Justificativa[]): Record<IndicadorId, number> {
  const c: Record<IndicadorId, number> = { rating: 0, devolucao: 0, refugo: 0 };
  for (const j of lista) c[j.indicador]++;
  return c;
}

/** Quem mais escreveu no período. Serve para a liderança ver se a
 *  explicação está vindo de todo mundo ou de duas pessoas só. */
export function contarPorPessoa(
  lista: Justificativa[],
): { nome: string; total: number; graves: number }[] {
  const mapa = new Map<string, { nome: string; total: number; graves: number }>();
  for (const j of lista) {
    const atual = mapa.get(j.colaboradorId) ?? { nome: j.colaboradorNome, total: 0, graves: 0 };
    atual.total++;
    if (j.grave) atual.graves++;
    mapa.set(j.colaboradorId, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
