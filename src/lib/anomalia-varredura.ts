import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { CATALOGO_DE_METAS } from "@/lib/metas";
import { avaliarSerie } from "@/lib/gatilho-anomalia";
import { seriesDoIndicador } from "@/lib/gatilho-anomalia-server";

/**
 * A VARREDURA DO GATILHO -- de indicador fora da faixa para relato aberto.
 *
 * Roda junto com os outros lembretes (ver varrerLembretes), a cada 15
 * minutos. Não tem cron próprio de propósito: um segundo agendador seria
 * mais uma coisa para alguém lembrar de conferir quando parasse.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO, e em dois níveis:
 *
 *   1. O banco recusa o segundo relato aberto do mesmo indicador --
 *      índice único parcial `pa_relato_aberto_unico` (migration 099).
 *      Não é uma checagem no código que duas varreduras simultâneas
 *      poderiam furar: é o Postgres dizendo não.
 *
 *   2. O aviso carrega uma chave por indicador e por dia, do mesmo jeito
 *      que os outros lembretes. Rodar quatro vezes por hora não pode
 *      virar quatro avisos.
 *
 * E É POR ISSO QUE O RELATO NASCE COM O NÚMERO CONGELADO: o valor, o
 * limite, a média e o desvio do dia do disparo ficam gravados na linha.
 * A média muda amanhã; o relato precisa continuar explicando por que
 * nasceu.
 */
export async function varrerGatilhosDeAnomalia(): Promise<{
  avaliados: number;
  abertos: number;
  erro?: string;
}> {
  const admin = createAdminClient();

  const { data: gatilhos, error } = await admin
    .from("pa_gatilhos_anomalia")
    .select("id, revenda_id, indicador, sigmas, limite_manual, minimo_pontos, responsavel_id")
    .eq("ativo", true);

  // Erro não vira "nenhum gatilho": zero aqui significaria processo sem
  // vigilância, e a varredura terminaria dizendo que está tudo bem.
  if (error) return { avaliados: 0, abertos: 0, erro: error.message };
  if (!gatilhos || gatilhos.length === 0) return { avaliados: 0, abertos: 0 };

  let avaliados = 0;
  let abertos = 0;

  // As séries são por REVENDA, e várias revendas podem ter o mesmo
  // indicador ligado. Buscar uma vez por revenda evita repetir a
  // consulta pesada a cada gatilho.
  const porRevenda = new Map<string, typeof gatilhos>();
  for (const g of gatilhos) {
    const lista = porRevenda.get(g.revenda_id) ?? [];
    lista.push(g);
    porRevenda.set(g.revenda_id, lista);
  }

  for (const [revendaId, doRevenda] of porRevenda) {
    let series: Record<string, { dia: string; valor: number }[]>;
    try {
      series = await seriesDoIndicador(revendaId);
    } catch (e) {
      // Uma revenda com problema não pode derrubar as outras.
      return {
        avaliados,
        abertos,
        erro: `Revenda ${revendaId}: ${e instanceof Error ? e.message : "falha ao ler as séries"}`,
      };
    }

    for (const g of doRevenda) {
      const def = CATALOGO_DE_METAS.find((m) => m.chave === g.indicador);
      const pontos = series[g.indicador];
      // Indicador cuja série ainda não foi ligada: não é anomalia nem
      // erro -- é uma leitura que não existe. Passar adiante em silêncio
      // é o certo; a tela de configuração já diz isso a quem configura.
      if (!def || !pontos || pontos.length === 0) continue;

      avaliados++;

      const avaliacao = avaliarSerie(pontos, {
        sentido: def.sentido,
        sigmas: Number(g.sigmas),
        limiteManual: g.limite_manual === null ? null : Number(g.limite_manual),
      });
      if (!avaliacao.disparo || avaliacao.limite === null) continue;

      const { disparo, base } = avaliacao;

      /*
        SÓ O DESVIO DE HOJE ABRE RELATO.

        A série tem 90 dias, e vários deles podem estar fora do limite --
        mas abrir relato de um desvio de três semanas atrás seria pedir
        para a liderança explicar um problema que ela nem lembra. O
        gatilho é sobre agir agora.
      */
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const ontem = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      });
      if (disparo.ponto.dia !== hoje && disparo.ponto.dia !== ontem) continue;

      const { data: criado, error: erroInsert } = await admin
        .from("pa_relatos_anomalia")
        .insert({
          revenda_id: revendaId,
          gatilho_id: g.id,
          indicador: def.chave,
          indicador_rotulo: def.rotulo,
          dia_do_disparo: disparo.ponto.dia,
          valor: disparo.ponto.valor,
          limite: disparo.limite,
          media: base.confiavel ? base.media : null,
          desvio: base.confiavel ? base.desvio : null,
          regra: avaliacao.limiteManual ? "manual" : disparo.regra,
          explicacao: disparo.explicacao,
          status: "aberto",
        })
        .select("id")
        .maybeSingle();

      // 23505 = já existe relato aberto deste indicador. É o índice único
      // parcial fazendo o trabalho -- não é falha, é a trava funcionando.
      if (erroInsert) {
        if (erroInsert.code === "23505") continue;
        return { avaliados, abertos, erro: `Ao abrir o relato: ${erroInsert.message}` };
      }
      if (!criado) continue;

      abertos++;

      const titulo = `🚨 ${def.rotulo} fora do limite`;
      const mensagem = `${disparo.explicacao} Registre o relato de anomalia.`;
      const url = `/gestao/anomalias/${criado.id}`;

      await criarNotificacao({
        modulo: "relato-anomalia",
        tipo: "lembrete",
        titulo,
        mensagem,
        url,
        revendaId,
        // Com responsável cadastrado, o aviso tem dono; sem ele vai para
        // a revenda, e o painel é quem distribui. Aviso sem dono é aviso
        // que todo mundo acha que é de outro.
        destinatarioId: g.responsavel_id ?? null,
        referenciaId: `anomalia:${criado.id}`,
      });
      await enviarPushDaRevenda(revendaId, {
        modulo: "relato-anomalia",
        titulo,
        mensagem,
        url,
        ...(g.responsavel_id ? { apenas: [g.responsavel_id] } : {}),
      });
    }
  }

  return { avaliados, abertos };
}
