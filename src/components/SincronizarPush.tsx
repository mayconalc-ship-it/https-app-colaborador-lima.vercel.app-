"use client";

import { useEffect } from "react";
import {
  assinar,
  dadosDaInscricao,
  situacaoDoAparelho,
} from "@/lib/push-cliente";
import { salvarInscricaoPush } from "@/app/notificacoes/push-actions";

/**
 * Mantém a inscrição de push viva, sem aparecer na tela.
 *
 * Só age em quem JÁ deu permissão -- nunca pede nada. Existe porque duas
 * coisas mudam sozinhas com o tempo e quebrariam o envio em silêncio:
 *
 * 1. O navegador troca o endpoint da inscrição de tempos em tempos.
 * 2. Quem muda de revenda passaria a receber aviso da revenda antiga.
 *
 * Roda uma vez por carregamento e falha calada: se der errado, a pessoa
 * continua vendo tudo no sino.
 */
export function SincronizarPush() {
  useEffect(() => {
    if (situacaoDoAparelho() !== "pronto") return;
    if (Notification.permission !== "granted") return;

    let ativo = true;
    assinar()
      .then((inscricao) => {
        if (!ativo || !inscricao) return;
        return salvarInscricaoPush(dadosDaInscricao(inscricao));
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, []);

  return null;
}
