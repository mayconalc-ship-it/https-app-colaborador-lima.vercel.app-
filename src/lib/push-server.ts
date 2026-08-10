import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ModuloNotificavel } from "@/lib/notificacoes";

/**
 * Disparo de notificações push.
 *
 * Vive ao lado de notificacoes-server.ts e segue a mesma regra de ouro:
 * NUNCA lança erro. Publicar um comunicado não pode falhar porque a
 * Google demorou para responder.
 *
 * O que o push NÃO faz: substituir o sino. O sino é a fonte da verdade e
 * funciona para todo mundo; o push é só o toque no ombro de quem está com
 * o app fechado. Quem não deu permissão continua vendo tudo no sino.
 */

const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVADA = process.env.VAPID_PRIVATE_KEY;
const VAPID_ASSUNTO = process.env.VAPID_SUBJECT || "mailto:ti@limalogistica.com.br";

/** Sem chaves configuradas o recurso fica desligado, sem quebrar nada. */
export function pushConfigurado() {
  return Boolean(VAPID_PUBLICA && VAPID_PRIVADA);
}

let configurado = false;
function configurar() {
  if (configurado || !pushConfigurado()) return;
  webpush.setVapidDetails(VAPID_ASSUNTO, VAPID_PUBLICA!, VAPID_PRIVADA!);
  configurado = true;
}

type Recado = {
  modulo: ModuloNotificavel;
  titulo: string;
  mensagem: string;
  url: string;
  /** Quem publicou não precisa receber o próprio aviso no bolso. */
  exceto?: string | null;
};

/**
 * Envia para todos os aparelhos inscritos de uma revenda.
 *
 * Respeita o mesmo interruptor do sino (notificacao_config): se o Admin
 * desligou o módulo naquela revenda, nada sai.
 */
export async function enviarPushDaRevenda(
  revendaId: string,
  recado: Recado,
): Promise<void> {
  try {
    if (!pushConfigurado()) return;
    configurar();

    const admin = createAdminClient();

    const { data: config } = await admin
      .from("notificacao_config")
      .select("ativa")
      .eq("revenda_id", revendaId)
      .eq("modulo", recado.modulo)
      .maybeSingle();

    if (config && !config.ativa) return;

    let consulta = admin
      .from("push_inscricoes")
      .select("id, endpoint, p256dh, auth")
      .eq("revenda_id", revendaId);

    if (recado.exceto) consulta = consulta.neq("colaborador_id", recado.exceto);

    const { data: inscricoes } = await consulta;
    if (!inscricoes || inscricoes.length === 0) return;

    const corpo = JSON.stringify({
      titulo: recado.titulo,
      mensagem: recado.mensagem,
      url: recado.url,
      // Agrupa por módulo: dois comunicados seguidos viram um aviso só na
      // barra do celular, em vez de duas linhas repetidas.
      tag: recado.modulo,
    });

    const expiradas: number[] = [];

    // Envio em paralelo com allSettled: um aparelho que sumiu não pode
    // impedir os outros 40 de receber.
    const resultados = await Promise.allSettled(
      inscricoes.map((i) =>
        webpush.sendNotification(
          {
            endpoint: i.endpoint,
            keys: { p256dh: i.p256dh, auth: i.auth },
          },
          corpo,
          { TTL: 60 * 60 * 12 },
        ),
      ),
    );

    resultados.forEach((r, idx) => {
      if (r.status === "rejected") {
        const status = (r.reason as { statusCode?: number })?.statusCode;
        // 404/410 = o navegador descartou a inscrição (app desinstalado,
        // permissão revogada). Guardar isso para sempre faria a lista
        // crescer para sempre e o envio ficar mais lento a cada mês.
        if (status === 404 || status === 410) expiradas.push(inscricoes[idx].id);
      }
    });

    if (expiradas.length > 0) {
      await admin.from("push_inscricoes").delete().in("id", expiradas);
    }

    const entregues = inscricoes
      .filter((_, idx) => resultados[idx].status === "fulfilled")
      .map((i) => i.id);

    if (entregues.length > 0) {
      await admin
        .from("push_inscricoes")
        .update({ usado_em: new Date().toISOString() })
        .in("id", entregues);
    }
  } catch {
    // Silêncio proposital, igual ao sino: avisar é secundário.
  }
}
