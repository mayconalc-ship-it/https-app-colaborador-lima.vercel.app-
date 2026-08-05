"use server";

import { getUsuarioId } from "@/lib/sessao";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dentroDoPeriodo,
  ehMotivoValido,
  hojeIso,
  motivoObrigatorio,
  type ConfigPesquisa,
} from "@/lib/pesquisa";

async function lerConfig(): Promise<ConfigPesquisa | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pesquisa_config")
    .select("ativa, inicio, fim, ciclo, titulo")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

export type SituacaoPesquisa =
  | { mostrar: false }
  | { mostrar: true; ciclo: string; titulo: string };

/**
 * Deve aparecer a pesquisa para quem está pedindo?
 *
 * Chamada uma vez por carregamento de página, não a cada navegação: são
 * duas consultas curtas, ambas por chave primária ou índice.
 */
export async function situacaoDaPesquisa(): Promise<SituacaoPesquisa> {
  const usuarioId = await getUsuarioId();
  if (!usuarioId) return { mostrar: false };

  const config = await lerConfig();
  if (!config || !dentroDoPeriodo(config, hojeIso())) return { mostrar: false };

  // Já respondeu neste ciclo? O ciclo é a chave: ao trocá-lo, esta consulta
  // deixa de encontrar a resposta antiga e a pessoa é convidada de novo.
  const admin = createAdminClient();
  const { data: jaRespondeu } = await admin
    .from("pesquisa_respostas")
    .select("id")
    .eq("colaborador_id", usuarioId)
    .eq("ciclo", config.ciclo)
    .maybeSingle();

  if (jaRespondeu) return { mostrar: false };

  return { mostrar: true, ciclo: config.ciclo, titulo: config.titulo };
}

export type ResultadoResposta = { ok: boolean; erro?: string };

export async function responderPesquisa(dados: {
  nota: number;
  motivos: string[];
  comentario: string;
}): Promise<ResultadoResposta> {
  const usuarioId = await getUsuarioId();
  if (!usuarioId) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const nota = Number(dados.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return { ok: false, erro: "Escolha de 1 a 5 estrelas." };
  }

  // O ciclo vem do servidor, nunca do navegador: senão daria para responder
  // em nome de um ciclo antigo e furar a trava de duplicidade.
  const config = await lerConfig();
  if (!config || !dentroDoPeriodo(config, hojeIso())) {
    return { ok: false, erro: "A pesquisa não está aberta no momento." };
  }

  const motivos = dados.motivos.filter(ehMotivoValido);
  if (motivoObrigatorio(nota) && motivos.length === 0) {
    return { ok: false, erro: "Escolha pelo menos um motivo." };
  }

  const comentario = dados.comentario.trim() || null;
  if (motivoObrigatorio(nota) && !comentario) {
    return { ok: false, erro: "Conte para nós o que podemos melhorar." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("pesquisa_respostas").insert({
    colaborador_id: usuarioId,
    ciclo: config.ciclo,
    nota,
    motivos,
    comentario,
  });

  if (error) {
    // 23505 = já existe resposta desta pessoa neste ciclo. Não é erro para
    // quem respondeu: o objetivo (estar respondido) já está cumprido.
    if (error.code === "23505") return { ok: true };
    return { ok: false, erro: "Não foi possível enviar. Tente de novo." };
  }

  return { ok: true };
}
