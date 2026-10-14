"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

export type PessoaParaPerfil = { id: string; nome: string; cargo: string | null };

/** Espelha o tipo do servidor -- componente de cliente não importa de
 *  módulo "server-only". */
type TipoDePerfil = "lideranca" | "colaborador";

/**
 * Colocar alguém num perfil -- na lista "Quem tem este perfil".
 *
 * SEM MODOS (14/10/2026, pedido do dono). Era a caixa "Aplicar a mais
 * alguém", com Somar e Espelhar, logo abaixo da grade do perfil: quem
 * editava o perfil entendia que precisava aplicar a mudança a cada um,
 * quando salvar já alcança todo mundo que está nele. Entrar no perfil
 * agora é um gesto só, o mesmo do "Colocar em outro perfil" da ficha: a
 * pessoa recebe o que o perfil dá, e nada do que ela tem é retirado.
 *
 * O PAPEL NUNCA MUDA EM SILÊNCIO (10/09/2026, defeito grave relatado pelo
 * dono: um perfil "Motorista" promoveu um motorista a liderança). Perfil
 * de LIDERANÇA num colaborador mostra o aviso em vermelho e exige uma
 * caixa marcada -- e o servidor recusa sem ela, então a caixa não é
 * enfeite que se contorna.
 */
export function ColocarNoPerfil({
  action,
  perfilId,
  perfilNome,
  pessoas,
  doPerfil,
  jaTem,
  tipo = "lideranca",
  papelDe = {},
}: {
  action: (formData: FormData) => void;
  perfilId: string;
  perfilNome: string;
  /** Quem pode entrar: da revenda, e ainda fora deste perfil. */
  pessoas: PessoaParaPerfil[];
  /** O que o perfil dá: "modulo:acao" (liderança) ou "modulo" (colaborador). */
  doPerfil: string[];
  /** O que cada pessoa já tem NESTA revenda, no mesmo formato. */
  jaTem: Record<string, string[]>;
  tipo?: TipoDePerfil;
  /** O papel de cada pessoa -- é o que decide se entrar vai promovê-la. */
  papelDe?: Record<string, string>;
}) {
  const [pessoaId, setPessoaId] = useState("");
  const [confirmouLideranca, setConfirmouLideranca] = useState(false);
  const confirmarEnvio = useConfirmarEnvio();

  const pessoa = pessoas.find((p) => p.id === pessoaId);
  const primeiroNome = pessoa?.nome.split(" ")[0] || "A pessoa";
  const atuais = new Set(jaTem[pessoaId] ?? []);
  const entrariam = doPerfil.filter((c) => !atuais.has(c)).length;
  const unidade = tipo === "colaborador" ? "módulo(s) do app" : "permissão(ões)";

  // Colaborador + perfil de liderança = promoção. Papel desconhecido (a
  // tela que chama não mandou) também pede a caixa: na dúvida, o lado que
  // exige confirmação.
  const papel = pessoaId ? papelDe[pessoaId] : undefined;
  const vaiPromover =
    tipo === "lideranca" && !!pessoaId && !["owner", "admin", "lideranca"].includes(papel ?? "");

  if (pessoas.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-slate-400">Todo mundo desta revenda já está neste perfil.</p>
    );
  }

  return (
    <form
      action={action}
      onSubmit={
        pessoa
          ? confirmarEnvio({
              titulo: vaiPromover
                ? `Tornar ${pessoa.nome} liderança com "${perfilNome}"?`
                : `Colocar ${pessoa.nome} no perfil "${perfilNome}"?`,
              detalhe:
                (entrariam === 0
                  ? `${primeiroNome} já tem tudo o que este perfil dá.`
                  : `Entram ${entrariam} ${unidade}.`) +
                " Nada do que ela já tem é retirado." +
                (vaiPromover ? ` ${primeiroNome} passa a entrar no Modo Liderança.` : ""),
              confirmar: vaiPromover ? "Tornar liderança" : "Colocar no perfil",
              perigo: vaiPromover,
            })
          : undefined
      }
      className="mt-2"
    >
      <input type="hidden" name="perfil_id" value={perfilId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="colaborador_id"
          required
          value={pessoaId}
          onChange={(e) => {
            setPessoaId(e.target.value);
            setConfirmouLideranca(false);
          }}
          aria-label={`Pessoa para colocar no perfil ${perfilNome}`}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-2 text-base focus:border-primary focus:outline-none sm:text-sm"
        >
          <option value="">+ Colocar alguém neste perfil…</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.cargo ? ` — ${p.cargo}` : ""}
            </option>
          ))}
        </select>
        <BotaoEnviar
          textoEnviando="Colocando..."
          disabled={!pessoa || (vaiPromover && !confirmouLideranca)}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            vaiPromover ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {vaiPromover ? "Tornar liderança" : "Colocar"}
        </BotaoEnviar>
      </div>

      {/* A PROMOÇÃO, em vermelho e com caixa própria. É a linha que faltou
          no defeito de 10/09/2026: aplicar um perfil promovia sem que
          ninguém lesse que isso ia acontecer. */}
      {vaiPromover && (
        <label className="mt-2 flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-xs leading-snug text-red-900">
          <input
            type="checkbox"
            name="tornar_lideranca"
            checked={confirmouLideranca}
            onChange={(e) => setConfirmouLideranca(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <strong>{pessoa?.nome} é colaborador.</strong> Este é um perfil de Modo Liderança, e entrar
            nele faz {primeiroNome} <strong>entrar no Modo Liderança</strong>. Confirmo que é isso mesmo.{" "}
            <em>Se a ideia era liberar módulos do app, use um perfil do tipo Colaborador.</em>
          </span>
        </label>
      )}
    </form>
  );
}
