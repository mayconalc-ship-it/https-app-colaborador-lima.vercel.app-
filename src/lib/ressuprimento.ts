/**
 * RESSUPRIMENTO DO PICKING -- a solicitação, o transporte e o abastecimento
 *
 * Até aqui o Abastecimento do Picking media UMA pessoa: quem abastecia
 * abria a sessão, lançava os produtos e fechava. O que acontecia ANTES --
 * alguém perceber a falta, pedir, a empilhadeira buscar no bloco e deixar
 * na área -- não existia em lugar nenhum, e é justamente onde a operação
 * espera.
 *
 * Três papéis, três momentos, e o que interessa medir é o INTERVALO entre
 * eles:
 *
 *   solicitante   pede os itens  ─┐
 *                                 ├─ espera pela empilhadeira
 *   operador      aceita         ─┘
 *                                 ├─ transporte
 *   operador      entrega na área─┐
 *                                 ├─ espera pelo ajudante
 *   ajudante      começa         ─┘
 *                                 ├─ abastecimento (já existia)
 *   ajudante      termina        ─┘
 *
 * NENHUM STATUS É GRAVADO. O estado sai dos carimbos de tempo, aqui, na
 * leitura. Uma coluna `status` mantida à mão pelas ações é a primeira
 * coisa a divergir do que de fato aconteceu -- basta uma ação falhar no
 * meio, e aí a fila mostra "em transporte" para um item que já foi
 * entregue, sem ninguém conseguir explicar por quê.
 *
 * Só o cancelamento tem carimbo próprio: cancelar é um FATO novo, não a
 * ausência de outro.
 *
 * Este arquivo não conhece banco nem React -- é o que permite conferir os
 * tempos sem subir a tela.
 */

export const ROTA_RESSUPRIMENTO = "/produtividade-armazem/ressuprimento";

// -------------------- PRIORIDADE --------------------

export const PRIORIDADES = ["normal", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const ROTULO_PRIORIDADE: Record<Prioridade, { rotulo: string; emoji: string; ajuda: string }> = {
  normal: {
    rotulo: "Normal",
    emoji: "📋",
    ajuda: "Entra na fila pela ordem de chegada.",
  },
  urgente: {
    rotulo: "Urgente",
    emoji: "🔴",
    ajuda: "Furou o picking ou vai furar antes da próxima onda. Passa na frente da fila.",
  },
};

export function ehPrioridade(v: unknown): v is Prioridade {
  return typeof v === "string" && (PRIORIDADES as readonly string[]).includes(v);
}

// -------------------- ESTADO --------------------

export const ESTADOS = [
  "aberta",
  "em_transporte",
  "na_area",
  "abastecendo",
  "concluida",
  "cancelada",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const ROTULO_ESTADO: Record<Estado, { rotulo: string; emoji: string; cor: string }> = {
  aberta: { rotulo: "Aguardando empilhadeira", emoji: "⏳", cor: "amber" },
  em_transporte: { rotulo: "Em transporte", emoji: "🏗️", cor: "blue" },
  na_area: { rotulo: "Na área, aguardando abastecer", emoji: "📍", cor: "amber" },
  abastecendo: { rotulo: "Abastecendo", emoji: "🛒", cor: "blue" },
  concluida: { rotulo: "Concluída", emoji: "✅", cor: "green" },
  cancelada: { rotulo: "Cancelada", emoji: "🚫", cor: "slate" },
};

export type ItemRessuprimento = {
  id: string;
  produtoId: string;
  unidade: string;
  quantidade: number;
  hl: number;
  /** Carimbo de quando ESTE item chegou na área. Item a item porque a
   *  empilhadeira raramente leva tudo numa viagem -- e uma solicitação
   *  que só muda de estado quando o último item chega esconde justamente
   *  a viagem que demorou. */
  entregueEm: string | null;
};

export type Ressuprimento = {
  id: string;
  criadoEm: string;
  solicitanteId: string;
  solicitanteNome: string;
  prioridade: Prioridade;
  /** Quando o operador ACEITOU a solicitação. Até aqui, ela está na fila. */
  transporteInicio: string | null;
  operadorId: string | null;
  operadorNome: string | null;
  canceladoEm: string | null;
  itens: ItemRessuprimento[];
  /** A sessão de abastecimento vinculada, quando já existe. */
  abastecimentoInicio: string | null;
  abastecimentoFim: string | null;
  abastecedorNome: string | null;
};

/**
 * Quando o transporte terminou: o carimbo do ÚLTIMO item entregue.
 *
 * Derivado, e não um campo próprio, porque um `transporte_fim` gravado
 * poderia discordar dos itens -- e o item é o fato, o resumo é opinião.
 *
 * `null` enquanto sobrar item por entregar. Compara como INSTANTE
 * (getTime), não como texto: os carimbos vêm do banco em UTC e a operação
 * lê em UTC-3, e comparar as duas strings dá a ordem errada na virada.
 */
export function transporteFim(r: Pick<Ressuprimento, "itens">): string | null {
  if (r.itens.length === 0) return null;
  let ultimo: string | null = null;
  for (const i of r.itens) {
    if (!i.entregueEm) return null;
    if (ultimo === null || new Date(i.entregueEm).getTime() > new Date(ultimo).getTime()) {
      ultimo = i.entregueEm;
    }
  }
  return ultimo;
}

/** O estado, lido dos carimbos. Ver o comentário do topo do arquivo. */
export function estadoDe(r: Ressuprimento): Estado {
  if (r.canceladoEm) return "cancelada";
  if (r.abastecimentoFim) return "concluida";
  if (r.abastecimentoInicio) return "abastecendo";
  if (transporteFim(r)) return "na_area";
  if (r.transporteInicio) return "em_transporte";
  return "aberta";
}

/** Está esperando alguém agir? É o que decide se aparece nas filas. */
export function estaAberta(r: Ressuprimento): boolean {
  const e = estadoDe(r);
  return e !== "concluida" && e !== "cancelada";
}

// -------------------- TEMPOS E MOVIMENTOS --------------------

export type TemposDoCiclo = {
  /** Da solicitação até o operador aceitar. */
  esperaEmpilhadeira: number | null;
  /** Do aceite até o último item chegar na área. */
  transporte: number | null;
  /** Da chegada na área até o ajudante começar a abastecer. */
  esperaAjudante: number | null;
  /** O abastecimento em si. */
  abastecimento: number | null;
  /** Da solicitação até o fim do abastecimento -- o número que a
   *  operação sente. */
  ciclo: number | null;
  /** Quanto do ciclo foi ESPERA. É o indicador que muda decisão: 40
   *  minutos de ciclo com 35 de espera não se resolve treinando quem
   *  abastece. `null` sem ciclo fechado. */
  pctEspera: number | null;
};

function minutosEntre(deISO: string | null, ateISO: string | null): number | null {
  if (!deISO || !ateISO) return null;
  const m = (new Date(ateISO).getTime() - new Date(deISO).getTime()) / 60_000;
  // Carimbo fora de ordem (relógio do servidor ajustado, correção manual)
  // vira null em vez de um número negativo que contaminaria toda média
  // que passar por aqui.
  return m >= 0 ? Math.round(m * 10) / 10 : null;
}

export function temposDoCiclo(r: Ressuprimento): TemposDoCiclo {
  const naArea = transporteFim(r);

  const esperaEmpilhadeira = minutosEntre(r.criadoEm, r.transporteInicio);
  const transporte = minutosEntre(r.transporteInicio, naArea);
  const esperaAjudante = minutosEntre(naArea, r.abastecimentoInicio);
  const abastecimento = minutosEntre(r.abastecimentoInicio, r.abastecimentoFim);
  const ciclo = minutosEntre(r.criadoEm, r.abastecimentoFim);

  const espera = (esperaEmpilhadeira ?? 0) + (esperaAjudante ?? 0);

  return {
    esperaEmpilhadeira,
    transporte,
    esperaAjudante,
    abastecimento,
    ciclo,
    pctEspera: ciclo !== null && ciclo > 0 ? Math.round((espera / ciclo) * 1000) / 10 : null,
  };
}

/**
 * Há quanto tempo está parada esperando a PRÓXIMA ação -- não desde que
 * foi criada.
 *
 * A diferença importa na fila: uma solicitação criada há 3 horas cujo
 * transporte começou agora não está atrasada, e mostrá-la como "3h" faria
 * a fila inteira parecer um incêndio.
 */
export function minutosParadaAgora(r: Ressuprimento, agora = new Date()): number | null {
  if (!estaAberta(r)) return null;

  const naArea = transporteFim(r);
  const desde = r.abastecimentoInicio ?? naArea ?? r.transporteInicio ?? r.criadoEm;
  return minutosEntre(desde, agora.toISOString());
}

// -------------------- FILA --------------------

/**
 * A ordem em que a empilhadeira deve atender: urgente primeiro, e dentro
 * de cada grupo a mais velha na frente.
 *
 * Ordenar só por prioridade deixaria uma normal envelhecendo para sempre
 * num dia cheio de urgentes; ordenar só por idade tornaria a prioridade
 * decorativa. As duas, nesta ordem, é o combinado que a operação entende.
 */
export function ordenarFila(lista: Ressuprimento[]): Ressuprimento[] {
  const peso = (r: Ressuprimento) => (r.prioridade === "urgente" ? 0 : 1);
  return [...lista].sort((a, b) => {
    const p = peso(a) - peso(b);
    if (p !== 0) return p;
    return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
  });
}

// -------------------- INDICADORES POR PESSOA --------------------

export type LinhaDoOperador = {
  operadorId: string;
  operadorNome: string;
  /** Solicitações que ele transportou por inteiro. */
  entregas: number;
  itens: number;
  hl: number;
  /** Minutos médios entre aceitar e entregar o último item. */
  transporteMedio: number | null;
  /** Minutos médios que a solicitação esperou na fila antes de ele
   *  aceitar. Não é culpa dele sozinho -- é o indicador da OPERAÇÃO, e
   *  fica aqui porque é onde se enxerga. */
  esperaMedia: number | null;
  hlPorHora: number | null;
};

function media(valores: (number | null)[]): number | null {
  const bons = valores.filter((v): v is number => v !== null);
  if (bons.length === 0) return null;
  return Math.round((bons.reduce((s, v) => s + v, 0) / bons.length) * 10) / 10;
}

export function indicadoresDoOperador(lista: Ressuprimento[]): LinhaDoOperador[] {
  const mapa = new Map<
    string,
    { nome: string; entregas: number; itens: number; hl: number; transportes: (number | null)[]; esperas: (number | null)[]; minutos: number }
  >();

  for (const r of lista) {
    if (!r.operadorId || !transporteFim(r)) continue;
    const t = temposDoCiclo(r);
    const a = mapa.get(r.operadorId) ?? {
      nome: r.operadorNome ?? "",
      entregas: 0,
      itens: 0,
      hl: 0,
      transportes: [],
      esperas: [],
      minutos: 0,
    };
    a.entregas += 1;
    a.itens += r.itens.length;
    a.hl += r.itens.reduce((s, i) => s + i.hl, 0);
    a.transportes.push(t.transporte);
    a.esperas.push(t.esperaEmpilhadeira);
    a.minutos += t.transporte ?? 0;
    mapa.set(r.operadorId, a);
  }

  return [...mapa]
    .map(([operadorId, v]) => ({
      operadorId,
      operadorNome: v.nome,
      entregas: v.entregas,
      itens: v.itens,
      hl: Math.round(v.hl * 1000) / 1000,
      transporteMedio: media(v.transportes),
      esperaMedia: media(v.esperas),
      // Só conta HL/h de quem teve tempo medido: um operador com 0 minutos
      // registrados daria uma taxa infinita e lideraria o ranking.
      hlPorHora: v.minutos > 0 ? Math.round((v.hl / (v.minutos / 60)) * 100) / 100 : null,
    }))
    .sort((a, b) => b.hl - a.hl);
}

export type LinhaDoSolicitante = {
  solicitanteId: string;
  solicitanteNome: string;
  solicitacoes: number;
  itens: number;
  hl: number;
  urgentes: number;
  canceladas: number;
  /** Ciclo médio das que fecharam -- o que ele espera, na prática. */
  cicloMedio: number | null;
};

export function indicadoresDoSolicitante(lista: Ressuprimento[]): LinhaDoSolicitante[] {
  const mapa = new Map<
    string,
    { nome: string; solicitacoes: number; itens: number; hl: number; urgentes: number; canceladas: number; ciclos: (number | null)[] }
  >();

  for (const r of lista) {
    const a = mapa.get(r.solicitanteId) ?? {
      nome: r.solicitanteNome,
      solicitacoes: 0,
      itens: 0,
      hl: 0,
      urgentes: 0,
      canceladas: 0,
      ciclos: [],
    };
    a.solicitacoes += 1;
    a.itens += r.itens.length;
    a.hl += r.itens.reduce((s, i) => s + i.hl, 0);
    if (r.prioridade === "urgente") a.urgentes += 1;
    if (r.canceladoEm) a.canceladas += 1;
    a.ciclos.push(temposDoCiclo(r).ciclo);
    mapa.set(r.solicitanteId, a);
  }

  return [...mapa]
    .map(([solicitanteId, v]) => ({
      solicitanteId,
      solicitanteNome: v.nome,
      solicitacoes: v.solicitacoes,
      itens: v.itens,
      hl: Math.round(v.hl * 1000) / 1000,
      urgentes: v.urgentes,
      canceladas: v.canceladas,
      cicloMedio: media(v.ciclos),
    }))
    .sort((a, b) => b.solicitacoes - a.solicitacoes);
}

// -------------------- RESUMO DO PERÍODO --------------------

export type ResumoRessuprimento = {
  total: number;
  concluidas: number;
  canceladas: number;
  abertas: number;
  hl: number;
  esperaEmpilhadeiraMedia: number | null;
  transporteMedio: number | null;
  esperaAjudanteMedia: number | null;
  abastecimentoMedio: number | null;
  cicloMedio: number | null;
  /** Quanto do ciclo médio é espera. O número que diz se o gargalo está
   *  em quem trabalha ou entre um trabalho e outro. */
  pctEspera: number | null;
};

export function resumirPeriodo(lista: Ressuprimento[]): ResumoRessuprimento {
  const tempos = lista.map(temposDoCiclo);

  const esperaEmpilhadeiraMedia = media(tempos.map((t) => t.esperaEmpilhadeira));
  const transporteMedio = media(tempos.map((t) => t.transporte));
  const esperaAjudanteMedia = media(tempos.map((t) => t.esperaAjudante));
  const cicloMedio = media(tempos.map((t) => t.ciclo));

  const espera = (esperaEmpilhadeiraMedia ?? 0) + (esperaAjudanteMedia ?? 0);

  return {
    total: lista.length,
    concluidas: lista.filter((r) => estadoDe(r) === "concluida").length,
    canceladas: lista.filter((r) => r.canceladoEm).length,
    abertas: lista.filter(estaAberta).length,
    hl: Math.round(lista.reduce((s, r) => s + r.itens.reduce((x, i) => x + i.hl, 0), 0) * 1000) / 1000,
    esperaEmpilhadeiraMedia,
    transporteMedio,
    esperaAjudanteMedia,
    abastecimentoMedio: media(tempos.map((t) => t.abastecimento)),
    cicloMedio,
    pctEspera: cicloMedio !== null && cicloMedio > 0 ? Math.round((espera / cicloMedio) * 1000) / 10 : null,
  };
}
