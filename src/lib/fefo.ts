/**
 * Quebra de FEFO -- vocabulário do "Padrão de Gestão de FEFO" da revenda.
 *
 * O módulo serve para UMA coisa: quem encontra a quebra no armazém avisa,
 * e o controle de estoque responde o que foi feito. Não gera NRI, não
 * bloqueia palete no sistema e não substitui a conferência semanal.
 */

export const TIPOS_QUEBRA_FEFO = [
  "data_maior_liberada",
  "sem_nri",
  "vencimento_proximo",
  "sem_bloqueio",
  "outro",
] as const;
export type TipoQuebraFefo = (typeof TIPOS_QUEBRA_FEFO)[number];

export function ehTipoQuebraFefo(v: unknown): v is TipoQuebraFefo {
  return typeof v === "string" && (TIPOS_QUEBRA_FEFO as readonly string[]).includes(v);
}

/** Cada tipo veio de uma regra escrita no padrão -- a explicação aparece
 *  na tela para quem informa não ter que adivinhar em qual encaixa. */
export const TIPO_QUEBRA_FEFO: Record<TipoQuebraFefo, { rotulo: string; emoji: string; ajuda: string }> = {
  data_maior_liberada: {
    rotulo: "Pegaram o palete de data mais longa",
    emoji: "📅",
    ajuda: "Existe outro palete do mesmo produto com validade menor, e o que estava sendo usado é o de data mais longa.",
  },
  sem_nri: {
    rotulo: "Palete sem NRI (ou NRI incompleta)",
    emoji: "🏷️",
    ajuda: "O padrão exige a NRI impressa e colada em pelo menos três lados do palete, com a validade visível.",
  },
  vencimento_proximo: {
    rotulo: "Menos de 45 dias, sem segregação",
    emoji: "⏳",
    ajuda: "Produto com menos de 45 dias de validade deveria estar segregado, conforme as regras do padrão.",
  },
  sem_bloqueio: {
    rotulo: "Deveria estar bloqueado e não estava",
    emoji: "🔓",
    ajuda: "Faltou a trava pallet no palete de data mais longa ou no produto próximo do vencimento.",
  },
  outro: {
    rotulo: "Outro",
    emoji: "❓",
    ajuda: "Não encaixa nos anteriores. Descreva na observação o que você encontrou.",
  },
};

export const DEPOSITOS_FEFO = ["A", "B", "C"] as const;
export type DepositoFefo = (typeof DEPOSITOS_FEFO)[number];

export function ehDepositoFefo(v: unknown): v is DepositoFefo {
  return typeof v === "string" && (DEPOSITOS_FEFO as readonly string[]).includes(v);
}

/** As ruas vão de 1 a 10 em todos os depósitos. */
export const RUAS_FEFO = Array.from({ length: 10 }, (_, i) => i + 1);

export function ehRuaFefo(v: unknown): boolean {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

/**
 * Limiar do próprio padrão: "prazo com menos de 45 dias de vencimento, o
 * produto será segregado". É daqui que sai o destaque na tela -- ninguém
 * digita criticidade, ela vem da data.
 */
export const DIAS_VALIDADE_CRITICA = 45;

export const STATUS_FEFO = ["aberta", "tratada"] as const;
export type StatusFefo = (typeof STATUS_FEFO)[number];

export const ROTULO_STATUS_FEFO: Record<StatusFefo, string> = {
  aberta: "Aberta",
  tratada: "Tratada",
};

/** Dias inteiros entre hoje e a validade. Negativo = já venceu. */
export function diasAteValidadeFefo(validadeISO: string, hoje = new Date()): number {
  const validade = new Date(`${validadeISO.slice(0, 10)}T00:00:00`);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((validade.getTime() - base.getTime()) / 86_400_000);
}

/** Quantos dias a ocorrência está esperando resposta do controle. */
export function diasAberta(criadoEmISO: string, hoje = new Date()): number {
  return Math.max(0, Math.floor((hoje.getTime() - new Date(criadoEmISO).getTime()) / 86_400_000));
}

/** Frase curta do prazo, já com o alerta do padrão embutido. */
export function rotuloValidade(validadeISO: string, hoje = new Date()) {
  const dias = diasAteValidadeFefo(validadeISO, hoje);
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`, critico: true };
  if (dias === 0) return { texto: "Vence hoje", critico: true };
  return {
    texto: `Vence em ${dias} dia${dias === 1 ? "" : "s"}`,
    critico: dias < DIAS_VALIDADE_CRITICA,
  };
}
