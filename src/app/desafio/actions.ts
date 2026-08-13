"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getContexto,
  getParticipacao,
  getRodadaAtual,
  listarRodadas,
} from "@/lib/quiz-server";
import { PONTOS_POR_QUESTAO, aproveitamento } from "@/lib/quiz";
import type { AreaId } from "@/lib/areas";

/**
 * O que o colaborador consegue mandar para o servidor no Desafio do Mês.
 *
 * Duas ações, e as duas desconfiam de tudo o que chega: o navegador manda
 * a questão e a alternativa, e nada mais. Quem descobre a rodada, a
 * participação, se a resposta está certa, quanto tempo levou e quantos
 * pontos valeu é o servidor -- é isso que impede a classificação de ser
 * escrita pela tela.
 */

/**
 * Teto do tempo de UMA pergunta.
 *
 * O tempo é medido aqui, entre uma resposta e a seguinte, e não no
 * relógio do navegador (que seria só um número enviado por quem quer
 * ganhar o desempate). O teto existe porque quem fecha o app no meio e
 * volta no dia seguinte não pode carregar 14 horas na conta.
 */
const TETO_POR_QUESTAO_MS = 5 * 60 * 1000;

export type Feedback = {
  ok: boolean;
  erro?: string;
  correta?: boolean;
  explicacao?: string;
  respostaCerta?: string;
  /** Era a última? A tela troca "Próxima" por "Ver resultado". */
  ultima?: boolean;
};

/**
 * Entra no desafio. Se já entrou antes e parou no meio, apenas volta --
 * a participação é uma só, e é a chave única no banco que garante isso,
 * não esta conferência.
 */
export async function comecarDesafio() {
  const ctx = await getContexto();
  if (!ctx?.area) redirect("/desafio");

  const rodada = await getRodadaAtual(ctx.revendaId, ctx.area);
  if (!rodada) redirect("/desafio");

  const admin = createAdminClient();

  const { count } = await admin
    .from("quiz_rodada_questoes")
    .select("*", { count: "exact", head: true })
    .eq("rodada_id", rodada.id);

  if (!count) redirect("/desafio?erro=Este+desafio+ainda+nao+tem+perguntas");

  await admin.from("quiz_participacoes").insert({
    revenda_id: ctx.revendaId,
    rodada_id: rodada.id,
    colaborador_id: ctx.perfil.id,
    colaborador_nome: ctx.perfil.nome,
    area: ctx.area,
  });
  // Erro de duplicidade é o caso normal de quem volta: a participação já
  // existe e é essa mesma que vamos continuar.

  redirect("/desafio/jogar");
}

export async function responderQuestao(dados: {
  questaoId: number;
  alternativaId: number;
}): Promise<Feedback> {
  const ctx = await getContexto();
  if (!ctx?.area) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const rodada = await getRodadaAtual(ctx.revendaId, ctx.area);
  if (!rodada) return { ok: false, erro: "O desafio não está aberto." };

  const participacao = await getParticipacao(rodada.id, ctx.perfil.id);
  if (!participacao) return { ok: false, erro: "Comece o desafio primeiro." };
  if (participacao.status === "concluida") {
    return { ok: false, erro: "Você já concluiu este desafio." };
  }

  const admin = createAdminClient();

  // A pergunta é mesmo desta rodada? Sem esta conferência daria para
  // responder uma questão de outra área só sabendo o número dela.
  const { data: vinculo } = await admin
    .from("quiz_rodada_questoes")
    .select("questao_id")
    .eq("rodada_id", rodada.id)
    .eq("questao_id", dados.questaoId)
    .maybeSingle();

  if (!vinculo) return { ok: false, erro: "Pergunta fora deste desafio." };

  const { data: alternativa } = await admin
    .from("quiz_alternativas")
    .select("id, questao_id, correta")
    .eq("id", dados.alternativaId)
    .maybeSingle();

  if (!alternativa || alternativa.questao_id !== dados.questaoId) {
    return { ok: false, erro: "Alternativa inválida." };
  }

  const tempoMs = await tempoDaPergunta(participacao.id);

  const { error } = await admin.from("quiz_respostas").insert({
    participacao_id: participacao.id,
    questao_id: dados.questaoId,
    alternativa_id: alternativa.id,
    correta: alternativa.correta,
    tempo_ms: tempoMs,
  });

  // 23505 = esta pergunta já tinha resposta gravada. Acontece com dois
  // toques no mesmo botão: o objetivo já está cumprido, então seguimos
  // para o resumo em vez de mostrar erro.
  if (error && error.code !== "23505") {
    return { ok: false, erro: "Não foi possível gravar. Tente de novo." };
  }

  if (!error) {
    await admin.rpc("quiz_contabilizar", {
      p_questao_id: dados.questaoId,
      p_correta: alternativa.correta,
    });
  }

  const total = await recalcular(participacao.id, rodada.totalPerguntas);
  const explicacao = await explicacaoDa(dados.questaoId);

  revalidatePath("/desafio");

  return {
    ok: true,
    correta: alternativa.correta,
    explicacao: explicacao.texto,
    respostaCerta: explicacao.respostaCerta,
    ultima: total.concluiu,
  };
}

/** Quanto tempo passou desde a resposta anterior (ou desde o começo). */
async function tempoDaPergunta(participacaoId: number) {
  const admin = createAdminClient();

  const [{ data: ultima }, { data: participacao }] = await Promise.all([
    admin
      .from("quiz_respostas")
      .select("respondida_em")
      .eq("participacao_id", participacaoId)
      .order("respondida_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("quiz_participacoes")
      .select("iniciada_em")
      .eq("id", participacaoId)
      .maybeSingle(),
  ]);

  const marco = ultima?.respondida_em ?? participacao?.iniciada_em;
  if (!marco) return 0;

  const decorrido = Date.now() - new Date(marco).getTime();
  return Math.max(0, Math.min(decorrido, TETO_POR_QUESTAO_MS));
}

/**
 * Refaz pontos, acertos e tempo a partir das respostas gravadas.
 *
 * Somar "+1" na linha da participação seria mais barato, mas erraria para
 * sempre se uma soma se perdesse. Recontar a cada resposta custa uma
 * consulta de dez linhas e deixa o placar sempre igual ao que está
 * gravado -- inclusive depois de qualquer correção manual no banco.
 */
async function recalcular(participacaoId: number, totalPerguntas: number) {
  const admin = createAdminClient();

  const { data: respostas } = await admin
    .from("quiz_respostas")
    .select("correta, tempo_ms")
    .eq("participacao_id", participacaoId);

  const lista = respostas ?? [];
  const acertos = lista.filter((r) => r.correta).length;
  const tempoMs = lista.reduce((s, r) => s + (r.tempo_ms ?? 0), 0);
  const concluiu = lista.length >= totalPerguntas;

  await admin
    .from("quiz_participacoes")
    .update({
      respondidas: lista.length,
      acertos,
      pontos: acertos * PONTOS_POR_QUESTAO,
      tempo_ms: tempoMs,
      ...(concluiu
        ? { status: "concluida", concluida_em: new Date().toISOString() }
        : {}),
    })
    .eq("id", participacaoId);

  if (concluiu) await premiar(participacaoId, acertos, totalPerguntas);

  return { acertos, concluiu };
}

async function explicacaoDa(questaoId: number) {
  const admin = createAdminClient();

  const [{ data: questao }, { data: certa }] = await Promise.all([
    admin
      .from("quiz_questoes")
      .select("explicacao")
      .eq("id", questaoId)
      .maybeSingle(),
    admin
      .from("quiz_alternativas")
      .select("texto")
      .eq("questao_id", questaoId)
      .eq("correta", true)
      .maybeSingle(),
  ]);

  return {
    texto: questao?.explicacao ?? "",
    respostaCerta: certa?.texto ?? "",
  };
}

/**
 * Selos que dependem só do desempenho da própria pessoa.
 *
 * Os de posição (campeão, Top 3, Top 5) NÃO saem daqui: enquanto a
 * rodada está aberta a classificação ainda muda, e um selo de 1º lugar
 * dado no dia 3 estaria mentindo no dia 30. Esses são entregues quando o
 * Admin encerra a rodada.
 */
async function premiar(
  participacaoId: number,
  acertos: number,
  totalPerguntas: number,
) {
  try {
    const admin = createAdminClient();

    const { data: p } = await admin
      .from("quiz_participacoes")
      .select("revenda_id, rodada_id, colaborador_id, area")
      .eq("id", participacaoId)
      .maybeSingle();

    if (!p) return;

    const codigos: string[] = [];
    if (acertos === totalPerguntas && totalPerguntas > 0) codigos.push("gabarito");
    if (aproveitamento(acertos, totalPerguntas) >= 90) codigos.push("especialista");

    // Três rodadas seguidas: as três mais recentes da área, todas
    // concluídas por esta pessoa.
    const rodadas = (
      await listarRodadas(p.revenda_id, {
        area: p.area as AreaId,
        publicadas: true,
      })
    ).slice(0, 3);

    if (rodadas.length === 3) {
      const { data: presencas } = await admin
        .from("quiz_participacoes")
        .select("rodada_id")
        .eq("colaborador_id", p.colaborador_id)
        .eq("status", "concluida")
        .in(
          "rodada_id",
          rodadas.map((r) => r.id),
        );

      if ((presencas ?? []).length === 3) codigos.push("sequencia3");
    }

    if (codigos.length === 0) return;

    await admin.from("quiz_conquistas").upsert(
      codigos.map((codigo) => ({
        revenda_id: p.revenda_id,
        colaborador_id: p.colaborador_id,
        rodada_id: p.rodada_id,
        codigo,
      })),
      { onConflict: "colaborador_id,rodada_id,codigo", ignoreDuplicates: true },
    );
  } catch {
    // Selo é enfeite: se falhar, a pontuação (que é o que vale) já está
    // gravada e não pode ser desfeita por causa disto.
  }
}
