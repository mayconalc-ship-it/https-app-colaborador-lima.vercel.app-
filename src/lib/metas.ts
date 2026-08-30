/**
 * METAS NOS CARTÕES
 *
 * Um cartão com meta responde três coisas de uma vez: o número, se ele
 * está batendo, e por quanto. A cor dá a resposta de longe; a diferença
 * fica discreta embaixo, porque quem já viu o verde não precisa do resto.
 *
 * O sentido importa: no TMA e na avaria, MENOR é melhor; em caixas por
 * hora, maior. Sem isso um TMA baixo apareceria como meta não batida.
 */

export type SentidoDaMeta = "menor_melhor" | "maior_melhor";

export type LeituraDaMeta = {
  batendo: boolean;
  /** Sempre positiva -- o lado fica em `acima`. */
  diferenca: number;
  acima: boolean;
  /** "12 min acima da meta de 90 min" */
  texto: string;
};

/** "1.234,5" com o número de casas pedido. */
function fmt(v: number, casas: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Compara realizado e alvo.
 *
 * Empate CONTA COMO BATIDO nos dois sentidos: uma meta de "até 2%" é
 * batida com 2%, e uma de "pelo menos 100 cx/h" é batida com 100. Tratar
 * o empate como falha faria a meta ser, na prática, um número a mais.
 */
export function avaliarMeta(
  realizado: number,
  alvo: number,
  sentido: SentidoDaMeta,
  opcoes: { sufixo?: string; casas?: number } = {},
): LeituraDaMeta {
  const { sufixo = "", casas = 0 } = opcoes;
  const diferenca = Math.abs(realizado - alvo);
  const acima = realizado > alvo;
  const batendo = sentido === "menor_melhor" ? realizado <= alvo : realizado >= alvo;

  const s = sufixo ? ` ${sufixo}` : "";
  const alvoTexto = `meta ${fmt(alvo, casas)}${s}`;

  // No empate não existe "0 acima": o texto vira a confirmação seca.
  if (diferenca === 0) return { batendo, diferenca, acima, texto: `na ${alvoTexto}` };

  return {
    batendo,
    diferenca,
    acima,
    texto: `${fmt(diferenca, casas)}${s} ${acima ? "acima" : "abaixo"} da ${alvoTexto}`,
  };
}

// ====================================================================
// O CATÁLOGO
// ====================================================================

/**
 * Onde cada meta mora.
 *
 * As que já existiam ficam onde estão: mover `meta_reepack_hora` para cá
 * quebraria o cálculo do Reepack sem ganhar nada. A tela de cadastro é
 * que sabe ler e gravar nas três fontes.
 */
export type FonteDaMeta = "pa_metas" | "recebimento_config" | "devolucao_config";

export const GRUPOS_DE_METAS = [
  "recebimento",
  "bancada",
  "despejo",
  "picking",
  "empilhadeira",
  "cinco-s",
  "entrega",
] as const;
export type GrupoDeMetas = (typeof GRUPOS_DE_METAS)[number];

export const ROTULO_GRUPO: Record<GrupoDeMetas, { emoji: string; titulo: string; ajuda: string }> = {
  recebimento: {
    emoji: "🚛",
    titulo: "Recebimento de carretas",
    ajuda: "Tempo de atendimento e qualidade do que chega.",
  },
  bancada: {
    emoji: "🧰",
    titulo: "Bancada (Seleção e Repack)",
    ajuda: "Triagem e reembalagem. O Repack tem meta por produto.",
  },
  despejo: {
    emoji: "💧",
    titulo: "Despejo",
    ajuda: "Litros por hora, por embalagem.",
  },
  picking: {
    emoji: "🧃",
    titulo: "Abastecimento do Picking",
    ajuda: "Hectolitros por hora abastecidos.",
  },
  empilhadeira: {
    emoji: "🏗️",
    titulo: "Empilhadeira",
    ajuda: "Rendimento do botijão de gás.",
  },
  "cinco-s": {
    emoji: "🧹",
    titulo: "5S",
    ajuda: "Frequência das execuções de checklist.",
  },
  entrega: {
    emoji: "🚚",
    titulo: "Entrega",
    ajuda: "Os indicadores que o motorista e o ajudante veem em Meus Indicadores.",
  },
};

export type DefinicaoDeMeta = {
  chave: string;
  grupo: GrupoDeMetas;
  rotulo: string;
  /** Uma frase dizendo o que a meta significa na operação. Sem isso, quem
   *  cadastra chuta -- e meta chutada vira cor errada em todo cartão. */
  ajuda: string;
  sufixo: string;
  sentido: SentidoDaMeta;
  casas: number;
  passo: string;
  fonte: FonteDaMeta;
  /** Só quando a fonte é uma config que já existia. */
  coluna?: string;
};

/**
 * Tudo que compara realizado contra régua.
 *
 * Fora daqui de propósito: Seleção, Picking e 5S usavam "% da média do
 * grupo" por não terem meta. Ganham meta aqui, mas a comparação com o
 * grupo continua existindo na pontuação -- quem não cadastrar a meta não
 * perde o indicador, só não ganha a cor.
 */
export const CATALOGO_DE_METAS: DefinicaoDeMeta[] = [
  {
    chave: "tma_alvo_minutos",
    grupo: "recebimento",
    rotulo: "TMA alvo",
    ajuda:
      "Quanto a carreta pode ocupar a operação, do horário agendado (ou da chegada) até a liberação. A conferência não entra.",
    sufixo: "min",
    sentido: "menor_melhor",
    casas: 0,
    passo: "1",
    fonte: "recebimento_config",
    coluna: "tma_alvo_minutos",
  },
  {
    chave: "avaria_pct",
    grupo: "recebimento",
    rotulo: "% de paletes com avaria",
    ajuda:
      "A conferência conta em PALETES: um palete com uma garrafa quebrada conta inteiro. O número fica bem acima de um percentual de volume -- calibre olhando o histórico, não pela intuição de 2%.",
    sufixo: "%",
    sentido: "menor_melhor",
    casas: 2,
    passo: "0.01",
    fonte: "pa_metas",
  },
  {
    chave: "selecao_un_hora",
    grupo: "bancada",
    rotulo: "Seleção e Triagem",
    ajuda: "Unidades triadas por hora de bancada.",
    sufixo: "un/h",
    sentido: "maior_melhor",
    casas: 0,
    passo: "1",
    fonte: "pa_metas",
  },
  {
    chave: "picking_hl_hora",
    grupo: "picking",
    rotulo: "Abastecimento do Picking",
    ajuda: "Hectolitros abastecidos por hora de sessão.",
    sufixo: "HL/h",
    sentido: "maior_melhor",
    casas: 2,
    passo: "0.01",
    fonte: "pa_metas",
  },
  {
    chave: "empilhadeira_horas_p20",
    grupo: "empilhadeira",
    rotulo: "Horas por botijão P20",
    ajuda:
      "Quantas horas de máquina um botijão precisa render. MAIOR é melhor: botijão que dura mais é gás mais bem aproveitado.",
    sufixo: "h",
    sentido: "maior_melhor",
    casas: 1,
    passo: "0.1",
    fonte: "pa_metas",
  },
  {
    chave: "cinco_s_execucoes_mes",
    grupo: "cinco-s",
    rotulo: "Execuções por pessoa no mês",
    ajuda: "Quantos checklists de 5S cada responsável deve concluir por mês.",
    sufixo: "",
    sentido: "maior_melhor",
    casas: 0,
    passo: "1",
    fonte: "pa_metas",
  },
  {
    chave: "meta_pct",
    grupo: "entrega",
    rotulo: "Devolução",
    ajuda:
      "Percentual dos PDVs do dia que pode voltar com devolução. É a mesma meta que o colaborador vê em Minha Devolução, e a que dispara o pedido de justificativa.",
    sufixo: "%",
    sentido: "menor_melhor",
    casas: 2,
    passo: "0.01",
    fonte: "devolucao_config",
    coluna: "meta_pct",
  },
  {
    chave: "rating_nota_media",
    grupo: "entrega",
    rotulo: "Nota média do Rating",
    ajuda:
      "A média de estrelas esperada. Cuidado ao apertar: 98% das avaliações já são 5 estrelas, então a média se move muito pouco -- o número que separa as pessoas é a quantidade de detratores.",
    sufixo: "★",
    sentido: "maior_melhor",
    casas: 2,
    passo: "0.01",
    fonte: "pa_metas",
  },
  {
    chave: "refugo_pct",
    grupo: "entrega",
    rotulo: "% de refugo na aferição",
    ajuda:
      "Refugo sobre o total aferido. A operação hoje fica com mediana perto de 0,2% nas aferições que dão refugo -- uma meta alta demais nunca acende, e uma baixa demais acende sempre.",
    sufixo: "%",
    sentido: "menor_melhor",
    casas: 2,
    passo: "0.01",
    fonte: "pa_metas",
  },
];

export function metasDoGrupo(grupo: GrupoDeMetas): DefinicaoDeMeta[] {
  return CATALOGO_DE_METAS.filter((m) => m.grupo === grupo);
}

export function ehGrupoDeMetas(v: string | undefined): v is GrupoDeMetas {
  return !!v && (GRUPOS_DE_METAS as readonly string[]).includes(v);
}

/**
 * Lê o valor digitado no formulário.
 *
 * Campo VAZIO limpa a meta (`null`), e isso é diferente de zero: sem meta
 * o cartão fica neutro; com meta zero ele passa a cobrar zero. Aceita
 * vírgula, que é como se digita em português.
 */
export function lerValorDeMeta(bruto: unknown): number | null | "invalido" {
  const t = String(bruto ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "invalido";
  return n;
}

/** Média de uma lista, ignorando os nulos. `null` quando não sobrou nada
 *  -- média de lista vazia é zero em JavaScript, e zero aqui seria lido
 *  como "TMA zerado" em vez de "sem medição". */
export function media(valores: (number | null)[]): number | null {
  const bons = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (bons.length === 0) return null;
  return bons.reduce((s, v) => s + v, 0) / bons.length;
}
