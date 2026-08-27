import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Preco publico por milhao de tokens (USD), dos modelos que o app chama.
 * Serve só para estimar custo no painel — não é a fatura real, que
 * continua no Anthropic Console.
 */
const PRECO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
  "claude-opus-5": { entrada: 5.0, saida: 25.0 },
};

function custoUsd(modelo: string, entrada: number, saida: number): number {
  const preco = PRECO_USD_POR_MILHAO[modelo];
  if (!preco) return 0;
  return (entrada / 1_000_000) * preco.entrada + (saida / 1_000_000) * preco.saida;
}

export type RecursoIA = "cinco_porques" | "quiz" | "leitura_horimetro";

/**
 * Grava uma chamada de IA para o painel de créditos.
 *
 * Nunca deixa uma falha de log derrubar a resposta que o usuário já
 * recebeu — o registro é auxiliar, a análise/geração já aconteceu.
 */
export async function registrarUsoIA(dados: {
  recurso: RecursoIA;
  modelo: string;
  revendaId: string | null;
  colaboradorId: string | null;
  entrada: number;
  saida: number;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("ia_uso_registros").insert({
      recurso: dados.recurso,
      modelo: dados.modelo,
      revenda_id: dados.revendaId,
      colaborador_id: dados.colaboradorId,
      tokens_entrada: dados.entrada,
      tokens_saida: dados.saida,
      custo_usd: custoUsd(dados.modelo, dados.entrada, dados.saida),
    });
  } catch {
    // Log é auxiliar — uma falha aqui não pode invalidar a resposta da IA.
  }
}

export { PRECO_USD_POR_MILHAO, custoUsd };
