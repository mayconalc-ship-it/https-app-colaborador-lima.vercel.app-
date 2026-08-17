"use server";

import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import {
  proximoPasso,
  iaConfigurada,
  mensagemDeErro,
  MODELO,
  type CategoriaCincoPorques,
  type NoDecisao,
  type RespostaPorque,
  type Terminal,
} from "@/lib/cinco-porques-ia";
import { registrarUsoIA } from "@/lib/ia-uso";

export type IniciarAnaliseResultado =
  | { ok: true; analiseId: number; primeiroNo: NoDecisao }
  | { ok: false; erro: string };

/**
 * Começa a análise: grava a linha e busca só a PRIMEIRA pergunta. A linha já
 * nasce no banco como "em_andamento" -- se o motorista fechar o app no meio do
 * fluxo, a análise fica registrada, só não termina.
 */
export async function iniciarAnalise(dados: {
  problemaId: string;
  problemaLabel: string;
  rota?: string;
  feedbackRotaId?: number;
}): Promise<IniciarAnaliseResultado> {
  if (!iaConfigurada()) {
    return {
      ok: false,
      erro: "A análise por IA não está disponível no momento. Fale com a liderança.",
    };
  }

  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };

  const problemaLabel = dados.problemaLabel.trim().slice(0, 200);
  if (!problemaLabel) return { ok: false, erro: "Descreva o problema." };

  let primeiroNo: NoDecisao;
  try {
    // Sem respostas ainda, então o schema obriga uma pergunta -- nunca uma
    // causa raiz. Por isso o `proximoNo` pode ser exigido aqui.
    const resultado = await proximoPasso({ problemaLabel, respostas: [] });
    await registrarUsoIA({
      recurso: "cinco_porques",
      modelo: MODELO,
      revendaId,
      colaboradorId: perfil.id,
      entrada: resultado.custo.entrada,
      saida: resultado.custo.saida,
    });
    if (!resultado.proximoNo) {
      return { ok: false, erro: "Não foi possível montar a primeira pergunta. Tente de novo." };
    }
    primeiroNo = resultado.proximoNo;
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }

  const supabase = await createClient();
  const { data: gravada, error } = await supabase
    .from("cinco_porques_analises")
    .insert({
      revenda_id: revendaId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      feedback_rota_id: dados.feedbackRotaId ?? null,
      rota: dados.rota?.trim() || null,
      problema_id: dados.problemaId,
      problema_label: problemaLabel,
    })
    .select("id")
    .single();

  if (error || !gravada) {
    return { ok: false, erro: "Não foi possível iniciar a análise. Tente de novo." };
  }

  return { ok: true, analiseId: gravada.id, primeiroNo };
}

export type PassoResultado =
  | { ok: true; proximoNo?: NoDecisao; terminal?: Terminal }
  | { ok: false; erro: string };

/**
 * O toque do motorista: grava a trilha e busca o próximo "por quê" (ou a
 * causa raiz). Uma ação só, e não duas -- persistir e decidir andam juntos
 * porque é a mesma trilha que alimenta os dois.
 *
 * A tela manda a trilha INTEIRA e o banco recebe ela inteira, sobrescrita.
 * A versão anterior lia as respostas, acrescentava uma e regravava, disparada
 * em segundo plano a cada toque: dois toques rápidos liam o mesmo array e o
 * segundo apagava o porquê do primeiro. Gravando o array completo, com a tela
 * como dona do estado, não existe leitura para ficar velha.
 */
export async function responderEAvancar(dados: {
  analiseId: number;
  problemaLabel: string;
  respostas: RespostaPorque[];
  motivo?: "outro_texto_livre" | "nenhuma_dessas";
}): Promise<PassoResultado> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };
  if (!iaConfigurada()) {
    return {
      ok: false,
      erro: "A análise por IA não está disponível no momento. Fale com a liderança.",
    };
  }

  const supabase = await createClient();
  const { error: erroGravacao } = await supabase
    .from("cinco_porques_analises")
    .update({
      respostas: dados.respostas,
      profundidade: dados.respostas.length,
    })
    .eq("id", dados.analiseId)
    .eq("colaborador_id", perfil.id);

  if (erroGravacao) {
    return { ok: false, erro: "Não foi possível salvar a resposta. Tente de novo." };
  }

  try {
    const resultado = await proximoPasso({
      problemaLabel: dados.problemaLabel,
      respostas: dados.respostas,
      motivo: dados.motivo,
    });
    await registrarUsoIA({
      recurso: "cinco_porques",
      modelo: MODELO,
      revendaId: await getRevendaId(),
      colaboradorId: perfil.id,
      entrada: resultado.custo.entrada,
      saida: resultado.custo.saida,
    });
    return {
      ok: true,
      proximoNo: resultado.proximoNo,
      terminal: resultado.terminal,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Fecha o registro do MOTORISTA. Não mexe em tratativa/resposta da
 *  liderança -- isso é território exclusivo do admin, em outra ação. */
export async function finalizarAnalise(dados: {
  analiseId: number;
  causaRaiz: string;
  categoria: CategoriaCincoPorques;
  acaoSugerida: string;
  tempoMs: number;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cinco_porques_analises")
    .update({
      causa_raiz: dados.causaRaiz,
      categoria: dados.categoria,
      acao_sugerida: dados.acaoSugerida,
      tempo_ms: dados.tempoMs,
      status: "concluida",
      concluida_em: new Date().toISOString(),
    })
    .eq("id", dados.analiseId)
    .eq("colaborador_id", perfil.id);

  if (error) return { ok: false, erro: "Não foi possível concluir a análise." };
  return { ok: true };
}

/**
 * O motorista marca se aceita ou não o retorno que a liderança escreveu.
 * Independente de `tratativa_status`, que é território exclusivo do admin
 * -- aqui é só a opinião do motorista sobre a resposta que recebeu.
 */
export async function responderTratativa(dados: {
  analiseId: number;
  aceitou: boolean;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cinco_porques_analises")
    .update({
      motorista_aceitou: dados.aceitou,
      motorista_aceitou_em: new Date().toISOString(),
    })
    .eq("id", dados.analiseId)
    .eq("colaborador_id", perfil.id);

  if (error) return { ok: false, erro: "Não foi possível registrar sua resposta." };
  return { ok: true };
}
