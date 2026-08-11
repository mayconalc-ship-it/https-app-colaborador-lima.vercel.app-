"use client";

import { useState } from "react";
import { ehIOS } from "@/lib/push-cliente";
import { usePushAparelho } from "@/components/usePushAparelho";

/**
 * Liga/desliga dos avisos no celular, dentro da lista do sino.
 *
 * Mora aqui porque é aqui que a pessoa está quando pensa em notificação.
 * Antes ficava em Minha Conta -- três toques de distância de um lugar que
 * ninguém abre por vontade própria, e o resultado era ninguém ativar.
 *
 * É um interruptor de verdade (role="switch"), não um botão com texto que
 * muda: o estado tem que dar para ler de relance, sem parar para
 * interpretar a frase.
 */
export function InterruptorPush() {
  const { situacao, permissao, ativo, ocupado, alternar } = usePushAparelho();
  const [ajudaAberta, setAjudaAberta] = useState(false);

  // Enquanto não sabemos, nada: uma linha que aparece e troca de texto
  // meio segundo depois passa impressão de app quebrado.
  if (situacao === null || situacao === "sem-chave") return null;

  if (situacao === "sem-suporte") {
    return (
      <Moldura>
        <p className="text-xs text-slate-400">
          Este navegador não recebe avisos no celular. Tudo continua
          aparecendo aqui no sino.
        </p>
      </Moldura>
    );
  }

  // iPhone fora da tela de início: o push simplesmente não existe. Em vez
  // de esconder, ensinamos -- são três toques e quase ninguém sabe.
  if (situacao === "precisa-instalar") {
    return (
      <Moldura>
        <button
          type="button"
          onClick={() => setAjudaAberta((v) => !v)}
          aria-expanded={ajudaAberta}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-sm font-semibold text-slate-700">
            📲 Receber avisos no celular
          </span>
          <span className="shrink-0 text-xs font-medium text-primary">
            {ajudaAberta ? "Fechar" : "Como fazer"}
          </span>
        </button>

        {ajudaAberta && (
          <div className="mt-2 rounded-xl bg-primary-soft p-3 text-xs text-slate-700">
            {ehIOS() ? (
              <>
                <p className="font-semibold text-primary-dark">
                  No iPhone, primeiro instale o app:
                </p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>
                    Toque em <strong>Compartilhar</strong> (o quadrado com a
                    seta para cima).
                  </li>
                  <li>
                    Escolha <strong>Adicionar à Tela de Início</strong>.
                  </li>
                  <li>Abra o app por esse ícone novo e volte aqui.</li>
                </ol>
                <p className="mt-2 text-slate-500">
                  É exigência da Apple, não do app.
                </p>
              </>
            ) : (
              <p>
                Instale o app pela opção <strong>Adicionar à tela de início</strong>{" "}
                do menu do navegador e volte aqui.
              </p>
            )}
          </div>
        )}
      </Moldura>
    );
  }

  if (permissao === "denied") {
    return (
      <Moldura>
        <p className="text-xs text-amber-700">
          ⚠️ Os avisos estão bloqueados para este app. Para liberar, abra as
          configurações do navegador, procure este site e permita
          notificações.
        </p>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <button
        type="button"
        role="switch"
        aria-checked={ativo}
        aria-busy={ocupado}
        disabled={ocupado}
        onClick={() => void alternar()}
        className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-700">
            📲 Avisos no celular
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">
            {ativo
              ? "Ligado neste aparelho"
              : "Receba mesmo com o app fechado"}
          </span>
        </span>

        {/* Trilho + bolinha. Tamanho generoso de propósito: é tocado com o
            polegar, muitas vezes com a mão suja de rota. */}
        <span
          aria-hidden="true"
          className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            ativo ? "bg-primary" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all ${
              ativo ? "left-6" : "left-1"
            }`}
          >
            {ocupado && (
              <span className="rodinha !h-3 !w-3 !border text-slate-400" />
            )}
          </span>
        </span>
      </button>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
      {children}
    </div>
  );
}
