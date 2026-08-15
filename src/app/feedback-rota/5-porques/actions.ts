"use server";

import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import {
  gerarArvore,
  expandirRamo,
  iaConfigurada,
  mensagemDeErro,
  type ArvoreDecisao,
  type CategoriaCincoPorques,
  type NoDecisao,
  type RespostaPorque,
  type Terminal,
} from "@/lib/cinco-porques-ia";

export type IniciarAnaliseResultado =
  | { ok: true; analiseId: number; arvore: ArvoreDecisao }
  | { ok: false; erro: string };

/**
 * Começa a análise: 1 chamada de IA, que devolve a árvore inteira. A linha
 * já nasce no banco como "em_andamento" -- se o motorista fechar o app no
 * meio do fluxo, a análise fica registrada, só não termina.
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

  let arvore: ArvoreDecisao;
  try {
    const resultado = await gerarArvore({ problemaLabel });
    arvore = resultado.arvore;
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
      arvore,
    })
    .select("id")
    .single();

  if (error || !gravada) {
    return { ok: false, erro: "Não foi possível iniciar a análise. Tente de novo." };
  }

  return { ok: true, analiseId: gravada.id, arvore };
}

/**
 * Registra um "porquê" respondido -- persistência, não decisão. A tela já
 * avançou sozinha para o próximo nó da árvore que tinha em mãos; esta ação
 * só grava o histórico, sem chamar IA nenhuma.
 */
export async function registrarResposta(dados: {
  analiseId: number;
  resposta: RespostaPorque;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  const { data: atual, error: erroLeitura } = await supabase
    .from("cinco_porques_analises")
    .select("respostas")
    .eq("id", dados.analiseId)
    .eq("colaborador_id", perfil.id)
    .single();

  if (erroLeitura || !atual) {
    return { ok: false, erro: "Não foi possível encontrar a análise." };
  }

  const respostas = [
    ...((atual.respostas as RespostaPorque[]) ?? []),
    dados.resposta,
  ];

  const { error } = await supabase
    .from("cinco_porques_analises")
    .update({ respostas, profundidade: respostas.length })
    .eq("id", dados.analiseId)
    .eq("colaborador_id", perfil.id);

  if (error) return { ok: false, erro: "Não foi possível salvar a resposta." };
  return { ok: true };
}

export type ExpansaoResultado =
  | { ok: true; proximoNo?: NoDecisao; terminal?: Terminal }
  | { ok: false; erro: string };

/**
 * Fallback: só roda quando o motorista sai da árvore precomputada
 * ("Outro" com texto livre, ou "Nenhuma dessas" além do que a árvore já
 * cobria). É a 2ª e última chamada de IA que uma análise pode custar.
 */
export async function expandirEFallback(dados: {
  analiseId: number;
  problemaLabel: string;
  respostas: RespostaPorque[];
  nivelAtual: number;
  motivo: "outro_texto_livre" | "nenhuma_dessas";
  textoLivre?: string;
}): Promise<ExpansaoResultado> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre novamente." };
  if (!iaConfigurada()) {
    return {
      ok: false,
      erro: "A análise por IA não está disponível no momento. Fale com a liderança.",
    };
  }

  try {
    const resultado = await expandirRamo({
      problemaLabel: dados.problemaLabel,
      respostas: dados.respostas,
      nivelAtual: dados.nivelAtual,
      motivo: dados.motivo,
      textoLivre: dados.textoLivre?.trim().slice(0, 200),
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
