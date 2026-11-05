import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ehTipoItem,
  type ItemPreventiva,
  type ModeloPreventiva,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";

/** Linha crua -> tipo do app, num lugar só. */
export function itemDeLinha(l: {
  id: string;
  ordem: number;
  pergunta: string;
  ajuda: string | null;
  tipo: string;
  opcoes: string[] | null;
  unidade: string | null;
  casas_decimais: number;
  obrigatorio: boolean;
  depende_item_id: string | null;
  depende_valores: string[] | null;
}): ItemPreventiva {
  return {
    id: l.id,
    ordem: l.ordem,
    pergunta: l.pergunta,
    ajuda: l.ajuda,
    tipo: ehTipoItem(l.tipo) ? l.tipo : "texto",
    opcoes: l.opcoes ?? [],
    unidade: l.unidade,
    casasDecimais: l.casas_decimais,
    obrigatorio: l.obrigatorio,
    dependeItemId: l.depende_item_id,
    dependeValores: l.depende_valores ?? [],
  };
}

export function modeloDeLinha(l: {
  id: string;
  nome: string;
  equipamento: string;
  emoji: string | null;
  periodicidade_dias: number;
}): ModeloPreventiva {
  return {
    id: l.id,
    nome: l.nome,
    equipamento: l.equipamento,
    emoji: l.emoji,
    periodicidadeDias: l.periodicidade_dias,
  };
}

export function respostaDeLinha(l: {
  item_id: string;
  valor_bool: boolean | null;
  valor_numero: string | number | null;
  valor_numeros: (string | number)[] | null;
  valor_texto: string | null;
  observacao: string | null;
}): RespostaPreventiva {
  return {
    itemId: l.item_id,
    valorBool: l.valor_bool,
    valorNumero: l.valor_numero === null ? null : Number(l.valor_numero),
    valorNumeros: l.valor_numeros ? l.valor_numeros.map(Number) : null,
    valorTexto: l.valor_texto,
    observacao: l.observacao,
  };
}

const COLUNAS_ITEM =
  "id, ordem, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais, obrigatorio, depende_item_id, depende_valores";

/** Modelos ativos da revenda, com a data da última preventiva de cada um. */
export async function modelosComSituacao(revendaId: string) {
  const admin = createAdminClient();

  const [{ data: modelos }, { data: ultimas }] = await Promise.all([
    admin
      .from("manut_prev_modelos")
      .select("id, nome, equipamento, emoji, periodicidade_dias")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    admin
      .from("manut_prev_execucoes")
      .select("modelo_id, finalizada_em, finalizada_por_nome")
      .eq("revenda_id", revendaId)
      .eq("status", "finalizada")
      .order("finalizada_em", { ascending: false }),
  ]);

  // Primeira ocorrência de cada modelo já é a mais recente (vem ordenado).
  const ultimaPorModelo = new Map<string, { em: string; por: string | null }>();
  for (const e of ultimas ?? []) {
    if (!ultimaPorModelo.has(e.modelo_id) && e.finalizada_em) {
      ultimaPorModelo.set(e.modelo_id, { em: e.finalizada_em, por: e.finalizada_por_nome });
    }
  }

  return (modelos ?? []).map((m) => ({
    modelo: modeloDeLinha(m),
    ultima: ultimaPorModelo.get(m.id) ?? null,
  }));
}

export async function itensDoModelo(modeloId: string, revendaId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("manut_prev_itens")
    .select(COLUNAS_ITEM)
    .eq("modelo_id", modeloId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .order("ordem");
  return (data ?? []).map(itemDeLinha);
}
