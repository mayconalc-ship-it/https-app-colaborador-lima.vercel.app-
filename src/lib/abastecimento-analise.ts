/**
 * AS PERGUNTAS DO ABASTECIMENTO DO PICKING.
 *
 * A aba de análise tinha só o ranking de SKU -- "qual produto consome mais
 * HL". É uma pergunta boa e é UMA pergunta. Quem cuida desta atividade
 * precisa responder outras quatro, e nenhuma delas se lê num ranking de
 * produto:
 *
 *   Estamos abastecendo mais ou menos que semana passada?   -> porDia
 *   Em que hora o picking mais pede?                         -> porHora
 *   A varredura da manhã está no mesmo ritmo do chamado
 *     pontual? (spoiler: nunca está, e é por isso que os
 *     dois não podem virar uma média só)                     -> porTipo
 *   Quem carrega esta atividade, e em que ritmo?             -> porPessoa
 *
 * Tudo aqui é matemática pura, sem banco e sem React -- é o que permite
 * conferir os números sem subir a tela.
 */

export type SessaoAnalise = {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  tipo: string;
  turno: string;
  inicio: string;
  fim: string | null;
  /** Veio de um pedido, ou foi lançamento avulso? */
  deSolicitacao: boolean;
  hl: number;
  itens: number;
};

function minutos(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  const m = (new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000;
  return m >= 0 ? m : null;
}

/** HL por hora de uma lista de sessões. `null` sem tempo medido -- e não
 *  zero: zero afirmaria que se trabalhou sem produzir. */
export function hlPorHora(sessoes: SessaoAnalise[]): number | null {
  let hl = 0;
  let min = 0;
  for (const s of sessoes) {
    const m = minutos(s.inicio, s.fim);
    if (m === null) continue;
    hl += s.hl;
    min += m;
  }
  if (min <= 0 || hl <= 0) return null;
  return Math.round((hl / (min / 60)) * 100) / 100;
}

function media(valores: (number | null)[]): number | null {
  const bons = valores.filter((v): v is number => v !== null);
  if (bons.length === 0) return null;
  return Math.round((bons.reduce((s, v) => s + v, 0) / bons.length) * 10) / 10;
}

// -------------------- POR DIA --------------------

export type LinhaPorDia = { dia: string; hl: number; sessoes: number };

/**
 * HL por dia, em ordem cronológica.
 *
 * O dia é o da OPERAÇÃO (UTC-3), não o do servidor: a Vercel roda em UTC,
 * e lá um abastecimento das 22h de terça é quarta-feira. Sem isto o
 * gráfico joga o fim de todo turno da noite no dia seguinte.
 */
export function porDia(sessoes: SessaoAnalise[]): LinhaPorDia[] {
  const mapa = new Map<string, { hl: number; sessoes: number }>();
  for (const s of sessoes) {
    const dia = diaDaOperacao(s.inicio);
    const a = mapa.get(dia) ?? { hl: 0, sessoes: 0 };
    a.hl += s.hl;
    a.sessoes += 1;
    mapa.set(dia, a);
  }
  return [...mapa]
    .map(([dia, v]) => ({ dia, hl: Math.round(v.hl * 10) / 10, sessoes: v.sessoes }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export function diaDaOperacao(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function horaDaOperacao(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

// -------------------- POR HORA --------------------

export type LinhaPorHora = { hora: number; sessoes: number; hl: number };

/**
 * Em que hora do dia o picking mais é abastecido.
 *
 * Responde onde reforçar a equipe -- e costuma desmentir a impressão de
 * todo mundo, que lembra do pico e esquece do resto. Só as horas que
 * TIVERAM movimento entram: uma barra de 24 posições com dezenove zeros
 * esconde as cinco que interessam.
 */
export function porHora(sessoes: SessaoAnalise[]): LinhaPorHora[] {
  const mapa = new Map<number, { sessoes: number; hl: number }>();
  for (const s of sessoes) {
    const h = horaDaOperacao(s.inicio);
    const a = mapa.get(h) ?? { sessoes: 0, hl: 0 };
    a.sessoes += 1;
    a.hl += s.hl;
    mapa.set(h, a);
  }
  return [...mapa]
    .map(([hora, v]) => ({ hora, sessoes: v.sessoes, hl: Math.round(v.hl * 10) / 10 }))
    .sort((a, b) => a.hora - b.hora);
}

// -------------------- POR TIPO E POR TURNO --------------------

export type LinhaDeGrupo = {
  chave: string;
  sessoes: number;
  hl: number;
  duracaoMedia: number | null;
  hlPorHora: number | null;
};

function agrupar(sessoes: SessaoAnalise[], chaveDe: (s: SessaoAnalise) => string): LinhaDeGrupo[] {
  const mapa = new Map<string, SessaoAnalise[]>();
  for (const s of sessoes) {
    const k = chaveDe(s);
    mapa.set(k, [...(mapa.get(k) ?? []), s]);
  }
  return [...mapa].map(([chave, lista]) => ({
    chave,
    sessoes: lista.length,
    hl: Math.round(lista.reduce((x, s) => x + s.hl, 0) * 10) / 10,
    duracaoMedia: media(lista.map((s) => minutos(s.inicio, s.fim))),
    hlPorHora: hlPorHora(lista),
  }));
}

/**
 * Completo x Pontual, lado a lado.
 *
 * Nunca somados: uma varredura da manhã de 2 horas é normal, um chamado
 * pontual de 2 horas é um problema. A média dos dois não descreve nenhum
 * dos dois -- e é justamente ela que alguém usaria para cobrar a pessoa
 * errada.
 */
export function porTipo(sessoes: SessaoAnalise[]): LinhaDeGrupo[] {
  return agrupar(sessoes, (s) => s.tipo).sort((a, b) => a.chave.localeCompare(b.chave));
}

export function porTurno(sessoes: SessaoAnalise[]): LinhaDeGrupo[] {
  const ordem = ["manha", "tarde", "noite"];
  return agrupar(sessoes, (s) => s.turno).sort(
    (a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave),
  );
}

// -------------------- POR PESSOA --------------------

export type LinhaDaPessoa = {
  colaboradorId: string;
  colaboradorNome: string;
  sessoes: number;
  hl: number;
  itens: number;
  hlPorHora: number | null;
  /** Quantas das sessões dela vieram de um pedido, e não de lançamento
   *  avulso. Diz quem está dentro do fluxo novo e quem ainda não. */
  deSolicitacao: number;
};

export function porPessoa(sessoes: SessaoAnalise[]): LinhaDaPessoa[] {
  const mapa = new Map<string, SessaoAnalise[]>();
  for (const s of sessoes) {
    mapa.set(s.colaboradorId, [...(mapa.get(s.colaboradorId) ?? []), s]);
  }
  return [...mapa]
    .map(([colaboradorId, lista]) => ({
      colaboradorId,
      colaboradorNome: lista[0].colaboradorNome,
      sessoes: lista.length,
      hl: Math.round(lista.reduce((x, s) => x + s.hl, 0) * 10) / 10,
      itens: lista.reduce((x, s) => x + s.itens, 0),
      hlPorHora: hlPorHora(lista),
      deSolicitacao: lista.filter((s) => s.deSolicitacao).length,
    }))
    .sort((a, b) => b.hl - a.hl);
}

// -------------------- RESUMO --------------------

export type ResumoDaAtividade = {
  sessoes: number;
  hl: number;
  itens: number;
  horas: number;
  hlPorHora: number | null;
  duracaoMedia: number | null;
  /** Dias com movimento -- o divisor honesto da média por dia. Domingo
   *  parado não pode derrubar a média de quem trabalhou. */
  diasComMovimento: number;
  hlPorDia: number | null;
  /** Quanto do trabalho já passa pelo fluxo de pedido. É o número que
   *  diz se o módulo novo pegou. */
  pctDeSolicitacao: number | null;
};

export function resumirAtividade(sessoes: SessaoAnalise[]): ResumoDaAtividade {
  const minutosTotais = sessoes.reduce((x, s) => x + (minutos(s.inicio, s.fim) ?? 0), 0);
  const hl = Math.round(sessoes.reduce((x, s) => x + s.hl, 0) * 10) / 10;
  const dias = new Set(sessoes.map((s) => diaDaOperacao(s.inicio)));

  return {
    sessoes: sessoes.length,
    hl,
    itens: sessoes.reduce((x, s) => x + s.itens, 0),
    horas: Math.round((minutosTotais / 60) * 10) / 10,
    hlPorHora: hlPorHora(sessoes),
    duracaoMedia: media(sessoes.map((s) => minutos(s.inicio, s.fim))),
    diasComMovimento: dias.size,
    hlPorDia: dias.size > 0 ? Math.round((hl / dias.size) * 10) / 10 : null,
    pctDeSolicitacao:
      sessoes.length > 0
        ? Math.round((sessoes.filter((s) => s.deSolicitacao).length / sessoes.length) * 1000) / 10
        : null,
  };
}
