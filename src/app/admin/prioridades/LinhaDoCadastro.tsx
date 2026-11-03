"use client";

import { useState } from "react";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { rotuloDoGv, type Gv } from "@/lib/prioridades";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type Acao = (fd: FormData) => Promise<ResultadoAcao>;

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";
const botao = "rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50";

/**
 * UMA LINHA DO CADASTRO (GV ou motivo) -- pedido do dono, 03/11/2026: o
 * botão Editar abre os campos embaixo da linha, com Salvar e Tirar, como
 * as áreas de Chamados. Sem ícone no botão.
 */
function Linha({ texto, children }: { texto: string; children: (fechar: () => void) => React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <li className={aberto ? "bg-slate-50/60" : ""}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 text-slate-800">{texto}</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={aberto ? `${botao} border-primary text-primary-dark` : botao}
        >
          {aberto ? "Fechar" : "Editar"}
        </button>
      </div>
      {aberto && <div className="space-y-2 border-t border-slate-100 p-3">{children(() => setAberto(false))}</div>}
    </li>
  );
}

export function LinhaDoGv({ gv, editar, remover }: { gv: Gv; editar: Acao; remover: Acao }) {
  return (
    <Linha texto={rotuloDoGv(gv)}>
      {(fechar) => (
        <>
          <FormNoLugar acao={editar} aoSalvar={fechar} className="grid grid-cols-[5rem_1fr_auto] items-end gap-2">
            <input type="hidden" name="antigo" value={gv.nome} />
            <label>
              <span className={rotulo}>Código</span>
              <input name="codigo" inputMode="numeric" defaultValue={gv.codigo ?? ""} className={campo} />
            </label>
            <label>
              <span className={rotulo}>Nome</span>
              <input name="nome" required defaultValue={gv.nome} maxLength={60} className={campo} />
            </label>
            <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Salvar
            </BotaoEnviar>
          </FormNoLugar>
          <BotaoNoLugar
            acao={remover}
            campos={{ nome: gv.nome }}
            perigo
            confirmacao={`Tirar ${gv.nome} da lista do link?`}
            detalhe="O que ele já enviou continua no painel."
            rotuloConfirmar="Tirar"
            className={botao}
          >
            Tirar da lista
          </BotaoNoLugar>
        </>
      )}
    </Linha>
  );
}

export function LinhaDoMotivo({ motivo, editar, remover }: { motivo: string; editar: Acao; remover: Acao }) {
  return (
    <Linha texto={motivo}>
      {(fechar) => (
        <>
          <FormNoLugar acao={editar} aoSalvar={fechar} className="grid grid-cols-[1fr_auto] items-end gap-2">
            <input type="hidden" name="antigo" value={motivo} />
            <label>
              <span className={rotulo}>Motivo</span>
              <input name="motivo" required defaultValue={motivo} maxLength={60} className={campo} />
            </label>
            <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Salvar
            </BotaoEnviar>
          </FormNoLugar>
          <BotaoNoLugar
            acao={remover}
            campos={{ motivo }}
            perigo
            confirmacao={`Tirar "${motivo}" da lista?`}
            detalhe="O que já foi enviado com esse motivo continua no painel."
            rotuloConfirmar="Tirar"
            className={botao}
          >
            Tirar da lista
          </BotaoNoLugar>
        </>
      )}
    </Linha>
  );
}
