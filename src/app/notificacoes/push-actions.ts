"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUsuarioId } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";

/**
 * Guarda (ou atualiza) a assinatura de push de UM aparelho.
 *
 * Chamada toda vez que o app abre com permissão já concedida, não só na
 * primeira vez. É de propósito: o navegador troca o endpoint sozinho de
 * tempos em tempos, e quem mudou de revenda precisa passar a receber os
 * avisos da revenda nova. Reenviar é barato; descobrir meses depois que
 * metade da equipe parou de receber, não.
 */
export async function salvarInscricaoPush(inscricao: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const usuarioId = await getUsuarioId();
  if (!usuarioId) return { ok: false as const };

  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false as const };

  if (!inscricao.endpoint || !inscricao.p256dh || !inscricao.auth) {
    return { ok: false as const };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("push_inscricoes").upsert(
    {
      colaborador_id: usuarioId,
      revenda_id: revendaId,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.p256dh,
      auth: inscricao.auth,
      user_agent: inscricao.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );

  return { ok: !error };
}

/** Quando a pessoa desliga os avisos, o aparelho sai da lista de envio. */
export async function removerInscricaoPush(endpoint: string) {
  const usuarioId = await getUsuarioId();
  if (!usuarioId) return { ok: false as const };

  const admin = createAdminClient();
  // O filtro por colaborador impede que alguém apague o aparelho de outro
  // mandando um endpoint adivinhado.
  const { error } = await admin
    .from("push_inscricoes")
    .delete()
    .eq("endpoint", endpoint)
    .eq("colaborador_id", usuarioId);

  return { ok: !error };
}
