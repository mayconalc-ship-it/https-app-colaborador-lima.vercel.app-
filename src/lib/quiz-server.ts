import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { hojeIso } from "@/lib/pesquisa";
import type { AreaId } from "@/lib/areas";
import {
  POSICOES_PADRAO,
  areaDoColaborador,
  comPosicao,
  embaralharCom,
  type StatusRodada,
} from "@/lib/quiz";

/**
 * Toda a leitura do Desafio do Mês.
 *
 * Passa inteira pela chave de administrador porque as tabelas do quiz não
 * têm política de leitura nenhuma — é o que impede o navegador de pedir a
 * coluna `correta` antes da hora. Em compensação, cada função daqui é
 * responsável por filtrar revenda e área na mão: não há RLS de rede de
 * segurança embaixo.
 *
 * `hojeIso` vem da pesquisa de propósito: é a mesma data da operação
 * (fuso da Bahia), e ter duas noções de "hoje" no app faria uma rodada
 * fechar em horas diferentes de uma tela para outra.
 */

export type Rodada = {
  id: number;
  revendaId: string;
  nome: string;
  temporada: number;
  mes: number;
  area: AreaId;
  pilar: string | null;
  padraoNome: string | null;
  padraoId: number | null;
  atividade: string | null;
  inicio: string;
  fim: string;
  totalPerguntas: number;
  status: StatusRodada;
};

const CAMPOS_RODADA =
  "id, revenda_id, nome, temporada, mes, area, pilar, padrao_id, padrao_nome, atividade, inicio, fim, total_perguntas, status";

type RodadaBruta = {
  id: number;
  revenda_id: string;
  nome: string;
  temporada: number;
  mes: number;
  area: string;
  pilar: string | null;
  padrao_id: number | null;
  padrao_nome: string | null;
  atividade: string | null;
  inicio: string;
  fim: string;
  total_perguntas: number;
  status: string;
};

function paraRodada(r: RodadaBruta): Rodada {
  return {
    id: r.id,
    revendaId: r.revenda_id,
    nome: r.nome,
    temporada: r.temporada,
    mes: r.mes,
    area: r.area as AreaId,
    pilar: r.pilar,
    padraoId: r.padrao_id,
    padraoNome: r.padrao_nome,
    atividade: r.atividade,
    inicio: r.inicio,
    fim: r.fim,
    totalPerguntas: r.total_perguntas,
    status: r.status as StatusRodada,
  };
}

/**
 * Quem está pedindo, de onde e de qual área.
 *
 * As três respostas andam sempre juntas: sem área não há campeonato, e
 * sem revenda não há dado nenhum. Devolver `area: null` em vez de barrar
 * é proposital — a tela explica o que falta no cadastro em vez de mostrar
 * erro.
 */
export const getContexto = cache(async () => {
  const [perfil, revendaId] = await Promise.all([getPerfil(), getRevendaId()]);
  if (!perfil || !revendaId) return null;

  return {
    perfil,
    revendaId,
    area: areaDoColaborador(perfil.area),
  };
});

/** Quantas posições o colaborador vê na tabela. O Admin decide. */
export const getPosicoesVisiveis = cache(async (revendaId: string) => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_config")
    .select("posicoes_visiveis")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  return data?.posicoes_visiveis ?? POSICOES_PADRAO;
});

/**
 * A rodada que está valendo: publicada e com hoje dentro do período.
 *
 * Se houver mais de uma (não deveria — a ação de publicar recusa
 * períodos sobrepostos), ganha a que começou por último.
 */
export async function getRodadaAtual(
  revendaId: string,
  area: AreaId,
): Promise<Rodada | null> {
  const hoje = hojeIso();
  const admin = createAdminClient();

  const { data } = await admin
    .from("quiz_rodadas")
    .select(CAMPOS_RODADA)
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .eq("status", "publicada")
    .lte("inicio", hoje)
    .gte("fim", hoje)
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? paraRodada(data as RodadaBruta) : null;
}

/** A última rodada que existiu, valendo ou não. Usada quando não há ativa. */
export async function getUltimaRodada(
  revendaId: string,
  area: AreaId,
): Promise<Rodada | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_rodadas")
    .select(CAMPOS_RODADA)
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .neq("status", "rascunho")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? paraRodada(data as RodadaBruta) : null;
}

export async function getRodada(id: number): Promise<Rodada | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_rodadas")
    .select(CAMPOS_RODADA)
    .eq("id", id)
    .maybeSingle();

  return data ? paraRodada(data as RodadaBruta) : null;
}

/** As rodadas de uma temporada, da mais nova para a mais antiga. */
export async function listarRodadas(
  revendaId: string,
  filtro: { area?: AreaId; temporada?: number; publicadas?: boolean } = {},
): Promise<Rodada[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("quiz_rodadas")
    .select(CAMPOS_RODADA)
    .eq("revenda_id", revendaId);

  if (filtro.area) consulta = consulta.eq("area", filtro.area);
  if (filtro.temporada) consulta = consulta.eq("temporada", filtro.temporada);
  if (filtro.publicadas) consulta = consulta.neq("status", "rascunho");

  const { data } = await consulta
    .order("temporada", { ascending: false })
    .order("inicio", { ascending: false });

  return (data ?? []).map((r) => paraRodada(r as RodadaBruta));
}

export type Participacao = {
  id: number;
  status: "em_andamento" | "concluida";
  pontos: number;
  acertos: number;
  respondidas: number;
  tempoMs: number;
  concluidaEm: string | null;
};

export async function getParticipacao(
  rodadaId: number,
  colaboradorId: string,
): Promise<Participacao | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_participacoes")
    .select("id, status, pontos, acertos, respondidas, tempo_ms, concluida_em")
    .eq("rodada_id", rodadaId)
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    pontos: data.pontos,
    acertos: data.acertos,
    respondidas: data.respondidas,
    tempoMs: Number(data.tempo_ms),
    concluidaEm: data.concluida_em,
  };
}

export type QuestaoNaTela = {
  id: number;
  pergunta: string;
  tipo: string;
  /** Sem o campo `correta`. É este recorte que garante o item 22 do
   *  pedido: o gabarito não sai do servidor antes da resposta. */
  alternativas: { id: number; texto: string }[];
  indice: number;
  total: number;
};

/**
 * A próxima pergunta que a pessoa ainda não respondeu.
 *
 * Devolve null quando acabaram — é assim que a tela do quiz sabe que é
 * hora de ir para o resultado. Quem abandonou no meio volta exatamente
 * aqui, porque "a próxima" é sempre calculada a partir do que já está
 * gravado, não de um contador na tela.
 */
export async function getQuestaoAtual(
  participacaoId: number,
  rodada: Rodada,
): Promise<QuestaoNaTela | null> {
  const admin = createAdminClient();

  const [{ data: doRodizio }, { data: respondidas }] = await Promise.all([
    admin
      .from("quiz_rodada_questoes")
      .select("questao_id, ordem")
      .eq("rodada_id", rodada.id)
      .order("ordem", { ascending: true }),
    admin
      .from("quiz_respostas")
      .select("questao_id")
      .eq("participacao_id", participacaoId),
  ]);

  const jaRespondeu = new Set((respondidas ?? []).map((r) => r.questao_id));
  const fila = (doRodizio ?? []).map((q) => q.questao_id);
  const indice = fila.findIndex((id) => !jaRespondeu.has(id));
  if (indice === -1) return null;

  const questaoId = fila[indice];

  const [{ data: questao }, { data: alternativas }] = await Promise.all([
    admin
      .from("quiz_questoes")
      .select("id, pergunta, tipo")
      .eq("id", questaoId)
      .maybeSingle(),
    admin
      .from("quiz_alternativas")
      .select("id, texto")
      .eq("questao_id", questaoId)
      .order("ordem", { ascending: true }),
  ]);

  if (!questao) return null;

  return {
    id: questao.id,
    pergunta: questao.pergunta,
    tipo: questao.tipo,
    // A ordem muda de pessoa para pessoa, mas não muda quando a mesma
    // pessoa recarrega a página.
    alternativas: embaralharCom(
      alternativas ?? [],
      `${participacaoId}:${questaoId}`,
    ),
    indice: indice + 1,
    total: fila.length,
  };
}

export type ItemRevisao = {
  questaoId: number;
  pergunta: string;
  explicacao: string;
  correta: boolean;
  minhaResposta: string | null;
  respostaCerta: string | null;
};

/**
 * O que a pessoa respondeu, pergunta a pergunta.
 *
 * Só é montado depois de a participação estar concluída — quem chama
 * confere isso antes. Aqui o gabarito pode aparecer: a essa altura ele
 * já é aprendizado, não resposta antecipada.
 */
export async function getRevisao(participacaoId: number): Promise<ItemRevisao[]> {
  const admin = createAdminClient();

  const { data: respostas } = await admin
    .from("quiz_respostas")
    .select("questao_id, alternativa_id, correta, respondida_em")
    .eq("participacao_id", participacaoId)
    .order("respondida_em", { ascending: true });

  if (!respostas || respostas.length === 0) return [];

  const ids = respostas.map((r) => r.questao_id);
  const [{ data: questoes }, { data: alternativas }] = await Promise.all([
    admin.from("quiz_questoes").select("id, pergunta, explicacao").in("id", ids),
    admin
      .from("quiz_alternativas")
      .select("id, questao_id, texto, correta")
      .in("questao_id", ids),
  ]);

  const porQuestao = new Map((questoes ?? []).map((q) => [q.id, q]));
  const porAlternativa = new Map((alternativas ?? []).map((a) => [a.id, a]));

  return respostas.map((r) => {
    const q = porQuestao.get(r.questao_id);
    const certa = (alternativas ?? []).find(
      (a) => a.questao_id === r.questao_id && a.correta,
    );
    return {
      questaoId: r.questao_id,
      pergunta: q?.pergunta ?? "",
      explicacao: q?.explicacao ?? "",
      correta: r.correta,
      minhaResposta: r.alternativa_id
        ? (porAlternativa.get(r.alternativa_id)?.texto ?? null)
        : null,
      respostaCerta: certa?.texto ?? null,
    };
  });
}

type ParticipacaoBruta = {
  colaborador_id: string;
  colaborador_nome: string;
  pontos: number;
  acertos: number;
  tempo_ms: number;
  concluida_em: string | null;
};

async function participacoesConcluidas(rodadaIds: number[]) {
  if (rodadaIds.length === 0) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_participacoes")
    .select(
      "rodada_id, colaborador_id, colaborador_nome, pontos, acertos, tempo_ms, concluida_em",
    )
    .in("rodada_id", rodadaIds)
    .eq("status", "concluida");

  return (data ?? []) as (ParticipacaoBruta & { rodada_id: number })[];
}

/**
 * A classificação de UMA rodada, já ordenada e numerada.
 *
 * `posicaoAnterior` sai da rodada imediatamente anterior da mesma área --
 * é o que desenha a seta de subiu/desceu. Quem não jogou antes fica sem
 * seta, que é diferente de "não mudou".
 */
export async function getClassificacaoRodada(rodada: Rodada) {
  const admin = createAdminClient();

  const { data: anterior } = await admin
    .from("quiz_rodadas")
    .select("id")
    .eq("revenda_id", rodada.revendaId)
    .eq("area", rodada.area)
    .eq("temporada", rodada.temporada)
    .lt("inicio", rodada.inicio)
    .neq("status", "rascunho")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ids = anterior ? [rodada.id, anterior.id] : [rodada.id];
  const todas = await participacoesConcluidas(ids);

  const daRodada = todas
    .filter((p) => p.rodada_id === rodada.id)
    .map((p) => linha(p, rodada.totalPerguntas));

  const posicoesAnteriores = new Map<string, number>();
  if (anterior) {
    comPosicao(
      todas
        .filter((p) => p.rodada_id === anterior.id)
        .map((p) => linha(p, rodada.totalPerguntas)),
    ).forEach((l) => posicoesAnteriores.set(l.colaboradorId, l.posicao));
  }

  return comPosicao(daRodada).map((l) => ({
    ...l,
    posicaoAnterior: posicoesAnteriores.get(l.colaboradorId) ?? null,
  }));
}

function linha(p: ParticipacaoBruta, totalPerguntas: number) {
  return {
    colaboradorId: p.colaborador_id,
    nome: p.colaborador_nome,
    pontos: p.pontos,
    acertos: p.acertos,
    jogos: 1,
    totalPerguntas,
    tempoMs: Number(p.tempo_ms),
    concluidaEm: p.concluida_em,
  };
}

export type LinhaTemporada = {
  colaboradorId: string;
  nome: string;
  pontos: number;
  acertos: number;
  jogos: number;
  totalPerguntas: number;
  tempoMs: number;
  concluidaEm: string | null;
  posicao: number;
  /** Pontos por mês, para as colunas Ago/Set/Out da tabela acumulada. */
  porMes: Record<number, number>;
};

/**
 * O campeonato do ano: soma das rodadas já publicadas de uma área.
 *
 * Só entra rodada que saiu do rascunho — desafio em preparo não pode
 * mexer na classificação de ninguém.
 */
export async function getClassificacaoTemporada(
  revendaId: string,
  area: AreaId,
  temporada: number,
): Promise<{ linhas: LinhaTemporada[]; rodadas: Rodada[] }> {
  const rodadas = (
    await listarRodadas(revendaId, { area, temporada, publicadas: true })
  ).sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (rodadas.length === 0) return { linhas: [], rodadas: [] };

  const porId = new Map(rodadas.map((r) => [r.id, r]));
  const participacoes = await participacoesConcluidas(rodadas.map((r) => r.id));

  const acumulado = new Map<string, LinhaTemporada>();
  for (const p of participacoes) {
    const rodada = porId.get(p.rodada_id);
    if (!rodada) continue;

    const atual =
      acumulado.get(p.colaborador_id) ??
      ({
        colaboradorId: p.colaborador_id,
        nome: p.colaborador_nome,
        pontos: 0,
        acertos: 0,
        jogos: 0,
        totalPerguntas: 0,
        tempoMs: 0,
        concluidaEm: null,
        posicao: 0,
        porMes: {},
      } satisfies LinhaTemporada);

    atual.nome = p.colaborador_nome;
    atual.pontos += p.pontos;
    atual.acertos += p.acertos;
    atual.jogos += 1;
    atual.totalPerguntas += rodada.totalPerguntas;
    atual.tempoMs += Number(p.tempo_ms);
    atual.porMes[rodada.mes] = (atual.porMes[rodada.mes] ?? 0) + p.pontos;
    // Para o desempate por "quem concluiu primeiro", vale a última
    // rodada concluída: é ela que ordena quem chegou junto no ano.
    if (
      p.concluida_em &&
      (!atual.concluidaEm || p.concluida_em > atual.concluidaEm)
    ) {
      atual.concluidaEm = p.concluida_em;
    }

    acumulado.set(p.colaborador_id, atual);
  }

  return { linhas: comPosicao([...acumulado.values()]), rodadas };
}

/**
 * O recorte que a tela mostra: as N primeiras posições + a linha da
 * própria pessoa, quando ela está fora dessa faixa.
 *
 * Quem está fora do Top N não vê os nomes das outras posições de fora --
 * a lista não é o objetivo, e expor a classificação inteira de 60 pessoas
 * é constrangimento sem função.
 */
export function recortarClassificacao<T extends { colaboradorId: string; posicao: number }>(
  linhas: T[],
  posicoesVisiveis: number,
  colaboradorId: string,
) {
  const visiveis = linhas.slice(0, posicoesVisiveis);
  const minha = linhas.find((l) => l.colaboradorId === colaboradorId) ?? null;
  const foraDaFaixa = minha ? minha.posicao > posicoesVisiveis : false;

  return { visiveis, minha, foraDaFaixa, total: linhas.length };
}

export type ResumoPessoal = {
  rodadas: {
    rodada: Rodada;
    pontos: number;
    acertos: number;
    posicao: number;
    total: number;
  }[];
  melhor: number;
  media: number;
  top3: number;
  top5: number;
};

/**
 * "Meu Campeonato": como a pessoa foi em cada rodada do ano.
 *
 * A posição vem da classificação completa de cada rodada, e não de uma
 * consulta separada — assim o número aqui é exatamente o mesmo que ela vê
 * na tabela, desempate incluído.
 */
export async function getResumoPessoal(
  revendaId: string,
  area: AreaId,
  temporada: number,
  colaboradorId: string,
): Promise<ResumoPessoal> {
  const rodadas = (
    await listarRodadas(revendaId, { area, temporada, publicadas: true })
  ).sort((a, b) => b.inicio.localeCompare(a.inicio));

  const participacoes = await participacoesConcluidas(rodadas.map((r) => r.id));

  const itens: ResumoPessoal["rodadas"] = [];
  for (const rodada of rodadas) {
    const daRodada = comPosicao(
      participacoes
        .filter((p) => p.rodada_id === rodada.id)
        .map((p) => linha(p, rodada.totalPerguntas)),
    );
    const minha = daRodada.find((l) => l.colaboradorId === colaboradorId);
    if (!minha) continue;

    itens.push({
      rodada,
      pontos: minha.pontos,
      acertos: minha.acertos,
      posicao: minha.posicao,
      total: daRodada.length,
    });
  }

  const pontos = itens.map((i) => i.pontos);
  return {
    rodadas: itens,
    melhor: pontos.length ? Math.max(...pontos) : 0,
    media: pontos.length
      ? Math.round(pontos.reduce((s, p) => s + p, 0) / pontos.length)
      : 0,
    top3: itens.filter((i) => i.posicao <= 3).length,
    top5: itens.filter((i) => i.posicao <= 5).length,
  };
}

export type QuestaoDaRodada = {
  id: number;
  pergunta: string;
  tipo: string;
  dificuldade: string;
  status: string;
  explicacao: string;
  /** Trecho do padrão que sustenta a resposta. Só a geração automática
   *  preenche — é o que a liderança confere na revisão. */
  origemTrecho: string | null;
  vezesUsada: number;
  acertos: number;
  erros: number;
  alternativas: { id: number; texto: string; correta: boolean }[];
};

/**
 * As questões de uma rodada, COM o gabarito.
 *
 * Só a administração chama isto — a tela do colaborador usa
 * `getQuestaoAtual`, que devolve as alternativas sem o campo `correta`.
 * Manter as duas leituras separadas é o que garante que uma mudança na
 * tela de revisão não exponha o gabarito por engano na tela do quiz.
 */
export async function getQuestoesDaRodada(
  rodadaId: number,
): Promise<QuestaoDaRodada[]> {
  const admin = createAdminClient();

  const { data: vinculos } = await admin
    .from("quiz_rodada_questoes")
    .select("questao_id, ordem")
    .eq("rodada_id", rodadaId)
    .order("ordem", { ascending: true });

  const ids = (vinculos ?? []).map((v) => v.questao_id);
  if (ids.length === 0) return [];

  const [{ data: questoes }, { data: alternativas }] = await Promise.all([
    admin
      .from("quiz_questoes")
      .select(
        "id, pergunta, tipo, dificuldade, status, explicacao, origem_trecho, vezes_usada, acertos, erros",
      )
      .in("id", ids),
    admin
      .from("quiz_alternativas")
      .select("id, questao_id, texto, correta, ordem")
      .in("questao_id", ids)
      .order("ordem", { ascending: true }),
  ]);

  const porId = new Map((questoes ?? []).map((q) => [q.id, q]));

  return ids
    .map((id) => {
      const q = porId.get(id);
      if (!q) return null;
      return {
        id: q.id,
        pergunta: q.pergunta,
        tipo: q.tipo,
        dificuldade: q.dificuldade,
        status: q.status,
        explicacao: q.explicacao,
        origemTrecho: q.origem_trecho,
        vezesUsada: q.vezes_usada,
        acertos: q.acertos,
        erros: q.erros,
        alternativas: (alternativas ?? [])
          .filter((a) => a.questao_id === id)
          .map((a) => ({ id: a.id, texto: a.texto, correta: a.correta })),
      };
    })
    .filter((q): q is QuestaoDaRodada => q !== null);
}

/** Questões do banco, da mesma área, que ainda não estão nesta rodada. */
export async function getBancoDisponivel(
  revendaId: string,
  area: AreaId,
  rodadaId: number,
) {
  const admin = createAdminClient();

  const [{ data: naRodada }, { data: doBanco }] = await Promise.all([
    admin
      .from("quiz_rodada_questoes")
      .select("questao_id")
      .eq("rodada_id", rodadaId),
    admin
      .from("quiz_questoes")
      .select("id, pergunta, dificuldade, padrao_nome, vezes_usada")
      .eq("revenda_id", revendaId)
      .eq("area", area)
      .eq("status", "ativa")
      .order("criado_em", { ascending: false })
      .limit(100),
  ]);

  const usadas = new Set((naRodada ?? []).map((v) => v.questao_id));
  return (doBanco ?? []).filter((q) => !usadas.has(q.id));
}

/**
 * Os indicadores da rodada para a liderança.
 *
 * O destaque é a questão mais errada: ela é o motivo do desafio existir.
 * Quando 8 de 10 pessoas erram a mesma pergunta, o problema não é a
 * turma — é o padrão que não foi ensinado direito.
 */
export async function getIndicadores(rodadaId: number) {
  const admin = createAdminClient();

  const [{ data: participacoes }, questoes] = await Promise.all([
    admin
      .from("quiz_participacoes")
      .select("id, pontos, acertos, status")
      .eq("rodada_id", rodadaId),
    getQuestoesDaRodada(rodadaId),
  ]);

  const lista = participacoes ?? [];
  const concluidas = lista.filter((p) => p.status === "concluida");
  const media = (valores: number[]) =>
    valores.length
      ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
      : 0;

  // O filtro é por PARTICIPAÇÃO desta rodada, não por questão: a mesma
  // pergunta pode voltar num desafio futuro, e somar as duas rodadas
  // apontaria a questão errada como "a mais errada deste mês".
  //
  // Só entram questões que alguém já respondeu: uma questão sem resposta
  // nenhuma teria 0% de acerto sem ninguém ter errado nada.
  const { data: respostas } = await admin
    .from("quiz_respostas")
    .select("questao_id, correta")
    .in("participacao_id", lista.length > 0 ? lista.map((p) => p.id) : [0]);

  const desempenho = questoes
    .map((q) => {
      const dela = (respostas ?? []).filter((r) => r.questao_id === q.id);
      const acertos = dela.filter((r) => r.correta).length;
      return {
        id: q.id,
        pergunta: q.pergunta,
        respondida: dela.length,
        acertos,
        percentual: dela.length ? Math.round((acertos / dela.length) * 100) : 0,
      };
    })
    .filter((q) => q.respondida > 0);

  const ordenadas = [...desempenho].sort((a, b) => a.percentual - b.percentual);

  return {
    iniciaram: lista.length,
    concluiram: concluidas.length,
    mediaPontos: media(concluidas.map((p) => p.pontos)),
    mediaAcertos: media(concluidas.map((p) => p.acertos)),
    taxaConclusao: lista.length
      ? Math.round((concluidas.length / lista.length) * 100)
      : 0,
    maisErrada: ordenadas[0] ?? null,
    maisAcertada: ordenadas[ordenadas.length - 1] ?? null,
    desempenho: ordenadas,
  };
}

/**
 * Os perfis desta revenda, já com a área traduzida para DU/AL.
 *
 * Uma consulta só, reaproveitada por quem conta elegíveis e por quem
 * dispara aviso: as duas perguntas partem exatamente da mesma lista.
 */
async function perfisDaRevenda(revendaId: string) {
  const admin = createAdminClient();

  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);

  const ids = (vinculos ?? []).map((v) => v.colaborador_id);
  if (ids.length === 0) return [];

  const { data: perfis } = await admin
    .from("profiles")
    .select("id, area")
    .in("id", ids);

  return (perfis ?? []).map((p) => ({
    id: p.id,
    area: areaDoColaborador(p.area),
  }));
}

/** Quem, nesta revenda, é da área — pelo cadastro que já existe. */
export async function getPessoasDaArea(revendaId: string, area: AreaId) {
  return (await perfisDaRevenda(revendaId))
    .filter((p) => p.area === area)
    .map((p) => p.id);
}

/**
 * Quantas pessoas da área existem — a base do "percentual de
 * participação". Sem ela, "12 participantes" não diz se foi muito ou
 * pouco.
 *
 * `semArea` é o aviso para o Admin: cadastro sem área é gente que não
 * consegue entrar em desafio nenhum.
 */
export async function getElegiveis(revendaId: string, area: AreaId) {
  const perfis = await perfisDaRevenda(revendaId);

  return {
    daArea: perfis.filter((p) => p.area === area).length,
    semArea: perfis.filter((p) => p.area === null).length,
  };
}

export async function getConquistas(revendaId: string, colaboradorId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quiz_conquistas")
    .select("codigo, criado_em")
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId)
    .order("criado_em", { ascending: false });

  return data ?? [];
}
