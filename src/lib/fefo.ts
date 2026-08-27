/**
 * Quebra de FEFO -- vocabulário do "Padrão de Gestão de FEFO" da revenda.
 *
 * O módulo serve para UMA coisa: quem encontra a quebra no armazém avisa,
 * e o controle de estoque responde o que foi feito. Não gera NRI, não
 * bloqueia palete no sistema e não substitui a conferência semanal.
 */

/**
 * Motivo da quebra. Deixou de ser lista fixa no código (migration 067,
 * pedido do dono): motivo novo nasce no próprio app, pelo Admin. A
 * operação descobre caso novo antes de alguém lembrar de pedir deploy.
 *
 * A `ajuda` não é enfeite: sem ela duas pessoas classificam a mesma
 * quebra de jeitos diferentes, e aí agrupar por motivo não diz nada.
 */
export type MotivoFefo = {
  id: string;
  nome: string;
  ajuda: string | null;
  emoji: string | null;
  ativo?: boolean;
};

/** Os quatro que a migration 067 semeia, a partir do padrão. Serve de
 *  referência para quem for cadastrar mais -- não é usado em runtime. */
export const MOTIVOS_DO_PADRAO = [
  "Pegaram o palete de data mais longa",
  "Palete sem NRI (ou NRI incompleta)",
  "Menos de 45 dias, sem segregação",
  "Deveria estar bloqueado e não estava",
] as const;

/**
 * Unidade da quantidade encontrada. Sem ela "12" é ambíguo -- 12 paletes
 * e 12 garrafas são problemas de tamanhos bem diferentes, e duas
 * ocorrências do mesmo produto não dariam para somar.
 */
export const UNIDADES_FEFO = ["palete", "caixa", "unidade"] as const;
export type UnidadeFefo = (typeof UNIDADES_FEFO)[number];

export const ROTULO_UNIDADE_FEFO: Record<UnidadeFefo, string> = {
  palete: "Palete(s)",
  caixa: "Caixa(s)",
  unidade: "Unidade(s)",
};

/** Forma curta, para caber no cartão da lista. */
export const ROTULO_UNIDADE_FEFO_CURTO: Record<UnidadeFefo, string> = {
  palete: "plt",
  caixa: "cx",
  unidade: "un",
};

export function ehUnidadeFefo(v: unknown): v is UnidadeFefo {
  return typeof v === "string" && (UNIDADES_FEFO as readonly string[]).includes(v);
}

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
