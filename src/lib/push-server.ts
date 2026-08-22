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

type Inscricao = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  colaborador_id: string;
  criado_em: string;
  usado_em: string | null;
  user_agent: string | null;
};

/**
 * Que aparelho é este, grosso modo.
 *
 * De propósito é grosso: se olhasse a versão do navegador, uma atualização
 * do iOS transformaria o mesmo celular em "outro aparelho" e a duplicidade
 * voltaria. A pergunta que interessa é "é o mesmo aparelho da pessoa?", e
 * para isso a família basta -- ninguém aqui carrega dois iPhones.
 */
function familiaDoAparelho(userAgent: string | null): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("iphone")) return "iphone";
  if (ua.includes("ipad")) return "ipad";
  if (ua.includes("android")) return "android";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os")) return "mac";
  return "outro";
}

/**
 * Um aviso por APARELHO, e não por registro.
 *
 * A tabela guarda uma inscrição por aparelho de propósito: quem usa celular
 * e computador recebe nos dois, e isso é desejado. O que não é desejado é a
 * pessoa receber o MESMO aviso duas vezes no MESMO celular -- e é o que
 * acontece quando sobra um registro velho.
 *
 * Registro velho não some sozinho: ele só é apagado quando o serviço de
 * push responde 404/410, e um app antigo ainda instalado responde normal.
 * Reinstalar o app, limpar os dados do navegador ou passar a abrir por um
 * endereço novo cria uma inscrição a mais sem tirar a anterior. Na troca de
 * domínio isso deixaria de ser um caso isolado e viraria a revenda inteira
 * recebendo tudo em dobro.
 *
 * Agrupar por pessoa + família do aparelho resolve o duplicado sem calar o
 * segundo aparelho de verdade.
 *
 * Dentro do grupo fica a mais recente por ATIVIDADE, não por criação: uma
 * inscrição recém-criada (ainda sem entrega confirmada) ganha da antiga,
 * que é o caso de quem acabou de reinstalar; e entre duas antigas ganha a
 * que comprovadamente recebeu por último. Ordenar só por `criado_em`
 * mandaria aviso para o navegador aberto uma vez e nunca mais; só por
 * `usado_em` deixaria o aparelho recém-configurado mudo.
 *
 * As perdedoras não são apagadas -- ficam inertes, sem receber nada.
 */
function umaPorAparelho(inscricoes: Inscricao[]): Inscricao[] {
  const atividade = (i: Inscricao) =>
    Math.max(
      i.usado_em ? Date.parse(i.usado_em) : 0,
      i.criado_em ? Date.parse(i.criado_em) : 0,
    );

  const melhorDe = new Map<string, Inscricao>();

  for (const i of inscricoes) {
    const chave = `${i.colaborador_id}|${familiaDoAparelho(i.user_agent)}`;
    const atual = melhorDe.get(chave);
    if (!atual || atividade(i) > atividade(atual)) melhorDe.set(chave, i);
  }

  return [...melhorDe.values()];
}

type Recado = {
  modulo: ModuloNotificavel;
  titulo: string;
  mensagem: string;
  url: string;
  /** Quem publicou não precisa receber o próprio aviso no bolso. */
  exceto?: string | null;
  /** Só estes aparelhos recebem -- em vez da revenda inteira. Usado
   *  quando o aviso é dirigido (ex.: recontagem, só para quem contou). */
  apenas?: string[];
};

/**
 * Envia para os aparelhos inscritos de uma revenda -- todos, ou só a
 * lista em `recado.apenas`, quando o aviso é dirigido a alguém específico.
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
    if (recado.apenas && recado.apenas.length === 0) return;
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
      .select(
        "id, endpoint, p256dh, auth, colaborador_id, criado_em, usado_em, user_agent",
      )
      .eq("revenda_id", revendaId);

    if (recado.apenas) consulta = consulta.in("colaborador_id", recado.apenas);
    else if (recado.exceto) consulta = consulta.neq("colaborador_id", recado.exceto);

    const { data: todas } = await consulta;
    if (!todas || todas.length === 0) return;

    const inscricoes = umaPorAparelho(todas);
    if (inscricoes.length === 0) return;

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
