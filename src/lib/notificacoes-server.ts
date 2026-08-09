import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import {
  PRIORIDADE,
  type ModuloNotificavel,
  type TipoNotificacao,
} from "@/lib/notificacoes";

/** Depois disso o aviso some sozinho do sino. */
const VALIDADE_DIAS = 21;

/**
 * Cria um aviso para todo o time.
 *
 * Chamada de dentro das ações que publicam conteúdo. NUNCA lança erro: se
 * a notificação falhar, a publicação em si já aconteceu e não pode ser
 * desfeita por causa de um aviso.
 *
 * Uma linha por publicação, não uma por colaborador.
 */
export async function criarNotificacao(dados: {
  modulo: ModuloNotificavel;
  tipo?: TipoNotificacao;
  titulo: string;
  mensagem: string;
  url: string;
  referenciaId?: string | number | null;
  criadoPor?: string;
}) {
  try {
    const admin = createAdminClient();

    // O aviso nasce na revenda de quem publicou. Sem isso, uma notícia de
    // Barreiras tocaria o sino de São Félix.
    const revendaId = await getRevendaId();
    if (!revendaId) return;

    // O Admin pode ter desligado os avisos deste módulo nesta revenda.
    const { data: config } = await admin
      .from("notificacao_config")
      .select("ativa")
      .eq("revenda_id", revendaId)
      .eq("modulo", dados.modulo)
      .maybeSingle();

    if (config && !config.ativa) return;

    const tipo = dados.tipo ?? "novo";
    const expira = new Date();
    expira.setDate(expira.getDate() + VALIDADE_DIAS);

    await admin.from("notificacoes").insert({
      revenda_id: revendaId,
      modulo: dados.modulo,
      tipo,
      titulo: dados.titulo,
      mensagem: dados.mensagem,
      url: dados.url,
      referencia_id:
        dados.referenciaId != null ? String(dados.referenciaId) : null,
      prioridade: PRIORIDADE[tipo],
      expira_em: expira.toISOString(),
      criado_por: dados.criadoPor ?? null,
    });
  } catch {
    // Silêncio proposital: avisar é secundário, publicar é o que importa.
  }
}

/**
 * Evita enxurrada quando alguém publica vários itens de uma vez.
 *
 * Enviar 12 padrões de uma vez geraria 12 avisos idênticos. Aqui, se já
 * existe aviso do mesmo módulo criado há poucos minutos, atualizamos o
 * texto dele em vez de criar outro.
 */
export async function criarOuAgrupar(
  dados: Parameters<typeof criarNotificacao>[0] & { janelaMinutos?: number },
) {
  try {
    const admin = createAdminClient();

    const revendaId = await getRevendaId();
    if (!revendaId) return;

    const desde = new Date();
    desde.setMinutes(desde.getMinutes() - (dados.janelaMinutos ?? 30));

    // O agrupamento é por revenda: publicar em Barreiras não pode reescrever
    // o aviso que São Félix acabou de receber.
    const { data: recente } = await admin
      .from("notificacoes")
      .select("id")
      .eq("revenda_id", revendaId)
      .eq("modulo", dados.modulo)
      .eq("ativa", true)
      .gte("criado_em", desde.toISOString())
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recente) {
      await admin
        .from("notificacoes")
        .update({
          titulo: dados.titulo,
          mensagem: dados.mensagem,
          url: dados.url,
          criado_em: new Date().toISOString(),
        })
        .eq("id", recente.id);
      return;
    }

    await criarNotificacao(dados);
  } catch {
    // idem
  }
}
