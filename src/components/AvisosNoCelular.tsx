"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import {
  assinar,
  dadosDaInscricao,
  ehIOS,
  registrarServiceWorker,
  situacaoDoAparelho,
  type SituacaoPush,
} from "@/lib/push-cliente";
import {
  removerInscricaoPush,
  salvarInscricaoPush,
} from "@/app/notificacoes/push-actions";

/**
 * Cartão de "Avisos no celular" em Minha Conta.
 *
 * Pede a permissão só depois de explicar para que serve. Popup de
 * permissão disparado na cara da pessoa costuma virar "Bloquear" -- e
 * bloqueio o app não consegue desfazer sozinho, a pessoa tem que ir nas
 * configurações do navegador. Uma chance só, então vale gastar duas
 * linhas de texto antes.
 */
/** Nada disso muda sozinho durante a visita; não há o que assinar. */
const semInscricao = () => () => {};

export function AvisosNoCelular() {
  // Só o navegador sabe responder isto, e o servidor não pode chutar --
  // por isso useSyncExternalStore com `null` no servidor: o cartão nasce
  // vazio na renderização do servidor e se preenche na hidratação, sem
  // divergência entre os dois.
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

  // A resposta ao popup não chega pelo snapshot acima (ele não é
  // reativo), então guardamos o que a pessoa acabou de responder.
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

  async function ligar() {
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
  }

  async function desligar() {
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
  }

  // Antes de saber a situação não mostramos nada: um cartão que aparece
  // e muda de texto meio segundo depois passa impressão de app quebrado.
  if (situacao === null) return null;

  if (situacao === "sem-chave") return null;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">
        🔔 Avisos no celular
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Receba um aviso quando sair comunicado novo, mesmo com o app fechado.
      </p>

      {situacao === "precisa-instalar" && <PassoAPassoIPhone />}

      {situacao === "sem-suporte" && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
          Este navegador não aceita avisos. Você continua vendo tudo no sino
          aqui dentro do app.
        </p>
      )}

      {situacao === "pronto" && permissao === "denied" && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Os avisos estão bloqueados para este app. Para liberar, abra as
          configurações do navegador, procure este site e permita
          notificações.
        </p>
      )}

      {situacao === "pronto" && permissao !== "denied" && (
        <button
          type="button"
          onClick={ativo ? desligar : ligar}
          disabled={ocupado}
          aria-busy={ocupado}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
            ativo
              ? "border border-slate-200 text-slate-600"
              : "bg-primary text-white"
          }`}
        >
          {ocupado && <span className="rodinha" aria-hidden="true" />}
          {ocupado
            ? "Um instante..."
            : ativo
              ? "Desligar avisos neste aparelho"
              : "Ativar avisos neste aparelho"}
        </button>
      )}

      {ativo && (
        <p className="mt-2 text-center text-xs text-slate-400">
          Ativo neste aparelho. Cada celular ou computador precisa ser ativado
          uma vez.
        </p>
      )}
    </section>
  );
}

/**
 * O caso chato: no iPhone o push só existe se o app estiver na tela de
 * início. Em vez de esconder o cartão, ensinamos o caminho -- são três
 * toques, e a maioria não sabe que dá.
 */
function PassoAPassoIPhone() {
  if (!ehIOS()) return null;
  return (
    <div className="mt-3 rounded-xl bg-primary-soft p-3 text-sm text-slate-700">
      <p className="font-semibold text-primary-dark">
        No iPhone, primeiro instale o app:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Toque em <strong>Compartilhar</strong> (o quadrado com a seta para
          cima, embaixo).
        </li>
        <li>
          Escolha <strong>Adicionar à Tela de Início</strong>.
        </li>
        <li>Abra o app por esse ícone novo e volte aqui.</li>
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        É uma exigência da Apple, não do app. No Android não precisa.
      </p>
    </div>
  );
}
