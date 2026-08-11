"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import {
  assinar,
  dadosDaInscricao,
  registrarServiceWorker,
  situacaoDoAparelho,
  type SituacaoPush,
} from "@/lib/push-cliente";
import {
  removerInscricaoPush,
  salvarInscricaoPush,
} from "@/app/notificacoes/push-actions";

/** Nada disso muda sozinho durante a visita; não há o que assinar. */
const semInscricao = () => () => {};

/**
 * Estado do push NESTE aparelho, com o liga/desliga pronto para usar.
 *
 * Virou hook quando o interruptor saiu de Minha Conta e foi para o sino:
 * a lógica é a mesma, só a moldura muda. Se um dia houver um terceiro
 * lugar (um lembrete na primeira visita, por exemplo), ele também entra
 * aqui sem copiar nada.
 */
export function usePushAparelho() {
  // Só o navegador sabe responder isto, e o servidor não pode chutar --
  // por isso useSyncExternalStore com `null` no servidor: nasce vazio na
  // renderização do servidor e se preenche na hidratação, sem divergência.
  const situacao = useSyncExternalStore<SituacaoPush | null>(
    semInscricao,
    situacaoDoAparelho,
    () => null,
  );

  const permissaoAtual = useSyncExternalStore<NotificationPermission | null>(
    semInscricao,
    useCallback(
      () =>
        typeof Notification === "undefined" ? null : Notification.permission,
      [],
    ),
    () => null,
  );

  // A resposta ao popup não chega pelo snapshot acima (ele não é reativo),
  // então guardamos o que a pessoa acabou de responder.
  const [respondido, setRespondido] = useState<NotificationPermission | null>(
    null,
  );
  const permissao = respondido ?? permissaoAtual;

  const [ativo, setAtivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const toast = useToast();

  // Já concedeu: confere se o aparelho ainda consta na lista de envio.
  useEffect(() => {
    if (situacao !== "pronto" || permissaoAtual !== "granted") return;

    let vivo = true;
    registrarServiceWorker()
      .then((r) => r.pushManager.getSubscription())
      .then((i) => {
        if (vivo) setAtivo(Boolean(i));
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [situacao, permissaoAtual]);

  const ligar = useCallback(async () => {
    setOcupado(true);
    try {
      const resposta = await Notification.requestPermission();
      setRespondido(resposta);

      if (resposta !== "granted") {
        toast.info(
          resposta === "denied"
            ? "Os avisos ficaram bloqueados. Dá para liberar nas configurações do navegador."
            : "Sem problema — você continua vendo tudo no sino aqui dentro.",
        );
        return;
      }

      const inscricao = await assinar();
      if (!inscricao) {
        toast.erro("Não consegui ativar neste aparelho.");
        return;
      }

      const r = await salvarInscricaoPush(dadosDaInscricao(inscricao));
      if (!r.ok) {
        toast.erro("Não consegui salvar. Tente de novo em instantes.");
        return;
      }

      setAtivo(true);
      toast.sucesso("Pronto! Você vai receber os avisos neste aparelho.");
    } catch {
      toast.erro("Não consegui ativar neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }, [toast]);

  const desligar = useCallback(async () => {
    setOcupado(true);
    try {
      const registro = await registrarServiceWorker();
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await removerInscricaoPush(inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setAtivo(false);
      toast.info("Avisos desligados neste aparelho.");
    } catch {
      toast.erro("Não consegui desligar agora.");
    } finally {
      setOcupado(false);
    }
  }, [toast]);

  const alternar = useCallback(
    () => (ativo ? desligar() : ligar()),
    [ativo, desligar, ligar],
  );

  return { situacao, permissao, ativo, ocupado, alternar };
}
