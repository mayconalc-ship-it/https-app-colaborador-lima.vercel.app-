/**
 * Dispara o aviso de indicador atualizado.
 *
 * Chamado no fim de cada importação. Consulta quem ficou com pendência,
 * conta por pessoa e manda notificação + push SÓ para essas pessoas.
 *
 * Silencioso por desenho: qualquer erro aqui é engolido. O aviso é um
 * extra da importação -- derrubar um import que já gravou tudo porque a
 * notificação falhou seria trocar um problema pequeno por um grande.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { lerTudoEmPaginas } from "@/lib/rating-server";
import { pctPdvDoDia, precisaJustificar, META_PADRAO_PCT } from "@/lib/devolucao";
import {
  ROTA_DO_INDICADOR,
  desdeQuandoAvisar,
  contarPendenciasPorPessoa,
  podeAvisar,
  textoDoAviso,
  type IndicadorAvisavel,
} from "@/lib/aviso-indicadores";

type Linha = Record<string, unknown>;

/** Quem tem avaliação abaixo de 5 ainda sem resposta. */
async function pendenciasDoRating(revendaId: string) {
  const admin = createAdminClient();
  const { linhas: avaliacoes } = await lerTudoEmPaginas<Linha>((de, ate) =>
    admin
      .from("rating_avaliacoes")
      .select("id, motorista_colaborador_id, ajudante1_colaborador_id, ajudante2_colaborador_id")
      .eq("revenda_id", revendaId)
      .lt("nota", 5)
      .gte("data_avaliacao", desdeQuandoAvisar())
      .range(de, ate),
  );
  if (avaliacoes.length === 0) return new Map<string, number>();

  const { linhas: respondidas } = await lerTudoEmPaginas<Linha>((de, ate) =>
    admin.from("rating_feedbacks").select("avaliacao_id, colaborador_id").eq("revenda_id", revendaId).range(de, ate),
  );
  // A resposta é POR PESSOA: se o motorista explicou e o ajudante não, o
  // ajudante continua pendente.
  const jaRespondeu = new Set(
    respondidas.map((r) => `${r.avaliacao_id as string}|${r.colaborador_id as string}`),
  );

  return contarPendenciasPorPessoa(
    avaliacoes.map((a) => ({
      id: a.id as string,
      pessoas: [
        a.motorista_colaborador_id,
        a.ajudante1_colaborador_id,
        a.ajudante2_colaborador_id,
      ].map((p) => (p && !jaRespondeu.has(`${a.id as string}|${p as string}`) ? (p as string) : null)),
    })),
  );
}

/** Quem tem aferição com refugo ainda sem explicação. */
async function pendenciasDoRefugo(revendaId: string) {
  const admin = createAdminClient();
  const { linhas: afericoes } = await lerTudoEmPaginas<Linha>((de, ate) =>
    admin
      .from("refugo_afericoes")
      .select(
        "id, qt_faltante, qt_qualidade, motorista_colaborador_id, ajudante1_colaborador_id, conferente_colaborador_id",
      )
      .eq("revenda_id", revendaId)
      .gte("data", desdeQuandoAvisar())
      .range(de, ate),
  );
  const comRefugo = afericoes.filter(
    (a) => Number(a.qt_faltante ?? 0) + Number(a.qt_qualidade ?? 0) > 0,
  );
  if (comRefugo.length === 0) return new Map<string, number>();

  const { linhas: explicadas } = await lerTudoEmPaginas<Linha>((de, ate) =>
    admin
      .from("refugo_justificativas")
      .select("afericao_id, colaborador_id")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  const jaExplicou = new Set(
    explicadas.map((r) => `${r.afericao_id as string}|${r.colaborador_id as string}`),
  );

  return contarPendenciasPorPessoa(
    comRefugo.map((a) => ({
      id: a.id as string,
      pessoas: [
        a.motorista_colaborador_id,
        a.ajudante1_colaborador_id,
        a.conferente_colaborador_id,
      ].map((p) => (p && !jaExplicou.has(`${a.id as string}|${p as string}`) ? (p as string) : null)),
    })),
  );
}

/** Quem tem dia acima da meta ainda sem justificativa. */
async function pendenciasDaDevolucao(revendaId: string) {
  const admin = createAdminClient();
  const [{ data: cfg }, { linhas: dias }] = await Promise.all([
    admin.from("devolucao_config").select("meta_pct").eq("revenda_id", revendaId).maybeSingle(),
    lerTudoEmPaginas<Linha>((de, ate) =>
      admin
        .from("devolucao_dia")
        .select(
          "data, pdvs_entregues, pdvs_devolvidos, motorista_colaborador_id, ajudante1_colaborador_id, ajudante2_colaborador_id",
        )
        .eq("revenda_id", revendaId)
        .gte("data", desdeQuandoAvisar())
        .range(de, ate),
    ),
  ]);
  const meta = Number(cfg?.meta_pct ?? META_PADRAO_PCT);

  const acima = dias.filter((d) =>
    precisaJustificar(
      pctPdvDoDia(Number(d.pdvs_entregues ?? 0), Number(d.pdvs_devolvidos ?? 0)),
      meta,
    ),
  );
  if (acima.length === 0) return new Map<string, number>();

  const { linhas: justificados } = await lerTudoEmPaginas<Linha>((de, ate) =>
    admin
      .from("devolucao_justificativas")
      .select("data, colaborador_id")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  const jaJustificou = new Set(
    justificados.map((j) => `${j.data as string}|${j.colaborador_id as string}`),
  );

  return contarPendenciasPorPessoa(
    acima.map((d) => ({
      id: d.data as string,
      pessoas: [
        d.motorista_colaborador_id,
        d.ajudante1_colaborador_id,
        d.ajudante2_colaborador_id,
      ].map((p) => (p && !jaJustificou.has(`${d.data as string}|${p as string}`) ? (p as string) : null)),
    })),
  );
}

/**
 * Avisa quem ficou com pendência depois da importação.
 *
 * Nada aqui pode derrubar o import: tudo dentro de try/catch, e um erro
 * de notificação só some do log.
 */
export async function avisarIndicadorAtualizado(
  revendaId: string,
  indicador: IndicadorAvisavel,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // Reimportar no mesmo dia é comum. Sem esta trava, a pessoa levaria o
    // mesmo aviso a cada importação, e a notificação vira spam.
    const { data: ultimo } = await admin
      .from("indicador_avisos")
      .select("avisado_em")
      .eq("revenda_id", revendaId)
      .eq("indicador", indicador)
      .maybeSingle();
    if (!podeAvisar(ultimo?.avisado_em as string | null)) return;

    const porPessoa =
      indicador === "rating"
        ? await pendenciasDoRating(revendaId)
        : indicador === "refugo"
          ? await pendenciasDoRefugo(revendaId)
          : await pendenciasDaDevolucao(revendaId);

    if (porPessoa.size === 0) return;

    const url = ROTA_DO_INDICADOR[indicador];

    // Uma notificação por pessoa, com o número DELA. Um texto só para
    // todo mundo perderia justamente o que faz o aviso ser tarefa.
    await Promise.all(
      [...porPessoa].map(([colaboradorId, quantas]) => {
        const { titulo, mensagem } = textoDoAviso(indicador, quantas);
        return criarNotificacao({
          modulo: "meus-indicadores",
          tipo: "pendencia",
          titulo,
          mensagem,
          url,
          destinatarioId: colaboradorId,
          revendaId,
        });
      }),
    );

    // O push é um só, com o texto no plural genérico: ele não sabe quantas
    // são de cada um, e mandar um push por pessoa com texto diferente
    // custaria uma chamada por pessoa sem ganho -- o número exato está na
    // notificação que ela abre.
    await enviarPushDaRevenda(revendaId, {
      modulo: "meus-indicadores",
      titulo: "📊 Seus indicadores foram atualizados",
      mensagem:
        "Tem coisa esperando a sua explicação. Boa parte não é falha de quem entrega — mas isso só aparece se você disser o que aconteceu.",
      url,
      apenas: [...porPessoa.keys()],
    });

    await admin.from("indicador_avisos").upsert(
      { revenda_id: revendaId, indicador, avisado_em: new Date().toISOString(), pessoas: porPessoa.size },
      { onConflict: "revenda_id,indicador" },
    );
  } catch {
    // Silencioso de propósito: ver o comentário no topo do arquivo.
  }
}
