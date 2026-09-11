"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

export type PessoaParaPerfil = { id: string; nome: string; cargo: string | null };

/** Espelha o tipo do servidor -- componente de cliente não importa de
 *  módulo "server-only". */
type TipoDePerfil = "lideranca" | "colaborador";

/**
 * Aplicar um perfil a alguém -- somando ou espelhando.
 *
 * O espelhar é o modo que TIRA, e um acesso que some sem aviso é a pior
 * coisa que esta tela pode fazer. Por isso a conta é feita AQUI, antes de
 * enviar: escolhida a pessoa, a tela lista nominalmente o que vai sair e a
 * confirmação é sobre essa lista.
 *
 * E O PAPEL NUNCA MUDA EM SILÊNCIO (10/09/2026, defeito grave relatado pelo
 * dono: um perfil "Motorista" promoveu um motorista a liderança). Perfil
 * de COLABORADOR diz com todas as letras que não dá Modo Liderança. Perfil
 * de LIDERANÇA aplicado a um colaborador mostra o aviso em vermelho e
 * exige uma caixa marcada -- e o servidor recusa sem ela, então a caixa não
 * é enfeite que se contorna.
 */
export function AplicarPerfil({
  action,
  perfilId,
  perfilNome,
  pessoas,
  doPerfil,
  jaTem,
  rotulos,
  tipo = "lideranca",
  papelDe = {},
  podeEspelhar = true,
}: {
  action: (formData: FormData) => void;
  perfilId: string;
  perfilNome: string;
  pessoas: PessoaParaPerfil[];
  /** O que o perfil dá: "modulo:acao" (liderança) ou "modulo" (colaborador). */
  doPerfil: string[];
  /** O que cada pessoa já tem NESTA revenda, no mesmo formato. */
  jaTem: Record<string, string[]>;
  /** Rótulo legível de cada chave. */
  rotulos: Record<string, string>;
  tipo?: TipoDePerfil;
  /** O papel de cada pessoa -- é o que decide se aplicar vai promovê-la. */
  papelDe?: Record<string, string>;
  /** Espelhar retira acessos: só o Admin (11/09/2026). O servidor recusa
   *  de qualquer jeito; a opção some para ninguém descobrir pelo erro. */
  podeEspelhar?: boolean;
}) {
  const [pessoaId, setPessoaId] = useState("");
  const [espelhar, setEspelhar] = useState(false);
  const [confirmouLideranca, setConfirmouLideranca] = useState(false);
  const confirmarEnvio = useConfirmarEnvio();

  const noPerfil = new Set(doPerfil);
  const atuais = jaTem[pessoaId] ?? [];
  const sairiam = atuais.filter((c) => !noPerfil.has(c));
  const entrariam = doPerfil.filter((c) => !atuais.includes(c));
  const pessoa = pessoas.find((p) => p.id === pessoaId);
  const nomeDaConcessao = (c: string) => rotulos[c] ?? c;
  const unidade = tipo === "colaborador" ? "módulo(s) do app" : "permissão(ões)";

  // Colaborador + perfil de liderança = promoção. Papel desconhecido (a
  // tela que chama não mandou) também pede a caixa: na dúvida, o lado que
  // exige confirmação.
  const papel = pessoaId ? papelDe[pessoaId] : undefined;
  const vaiPromover =
    tipo === "lideranca" && !!pessoaId && !["owner", "admin", "lideranca"].includes(papel ?? "");

  const pedido = () => {
    const promocao = vaiPromover
      ? ` ${pessoa?.nome ?? "A pessoa"} vai ENTRAR NO MODO LIDERANÇA com estas permissões.`
      : "";
    if (!espelhar || sairiam.length === 0) {
      return {
        titulo: vaiPromover
          ? `Tornar ${pessoa?.nome ?? "esta pessoa"} liderança com "${perfilNome}"?`
          : `${espelhar ? "Espelhar" : "Somar"} "${perfilNome}" em ${pessoa?.nome ?? "esta pessoa"}?`,
        detalhe:
          (entrariam.length === 0
            ? "Ela já tem tudo o que este perfil dá."
            : `Entram ${entrariam.length} ${unidade}. Nada é retirado.`) + promocao,
        confirmar: vaiPromover ? "Tornar liderança" : espelhar ? "Espelhar" : "Somar",
        perigo: vaiPromover,
      };
    }
    return {
      titulo: `${pessoa?.nome ?? "Esta pessoa"} vai PERDER ${sairiam.length} ${unidade}`,
      detalhe:
        `Saem por não estarem em "${perfilNome}": ` +
        sairiam.slice(0, 5).map(nomeDaConcessao).join("; ") +
        (sairiam.length > 5 ? ` e mais ${sairiam.length - 5}.` : ".") +
        (entrariam.length > 0 ? ` Entram ${entrariam.length}.` : "") +
        promocao,
      confirmar: `Retirar ${sairiam.length} e espelhar`,
      perigo: true,
    };
  };

  return (
    <form
      action={action}
      onSubmit={pessoaId ? confirmarEnvio(pedido()) : undefined}
      className="space-y-2 p-4"
    >
      <input type="hidden" name="perfil_id" value={perfilId} />
      <input type="hidden" name="modo" value={espelhar ? "espelhar" : "somar"} />

      {/* O QUE ESTE PERFIL FAZ COM O PAPEL, dito antes de escolher alguém. */}
      <p
        className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${
          tipo === "colaborador" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
        }`}
      >
        {tipo === "colaborador"
          ? "📱 Perfil de colaborador: libera módulos do app. A pessoa continua colaborador — não entra no Modo Liderança."
          : "⚙️ Perfil de liderança: dá acesso ao Modo Liderança. Para um colaborador, só com a confirmação abaixo."}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`pessoa-${perfilId}`}>
            Aplicar a
          </label>
          <select
            id={`pessoa-${perfilId}`}
            name="colaborador_id"
            required
            value={pessoaId}
            onChange={(e) => {
              setPessoaId(e.target.value);
              setConfirmouLideranca(false);
            }}
            className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
          >
            <option value="">Escolha a pessoa</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.cargo ? ` — ${p.cargo}` : ""}
              </option>
            ))}
          </select>
        </div>
        <BotaoEnviar
          compacto
          disabled={vaiPromover && !confirmouLideranca}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            vaiPromover || (espelhar && sairiam.length > 0)
              ? "bg-red-600 hover:bg-red-700"
              : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {vaiPromover ? "Tornar liderança" : espelhar ? "Espelhar" : "Somar"}
        </BotaoEnviar>
      </div>

      {/* A PROMOÇÃO, em vermelho e com caixa própria. É a linha que faltou
          no defeito de 10/09/2026: aplicar um perfil promovia sem que
          ninguém lesse que isso ia acontecer. */}
      {vaiPromover && (
        <label className="flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-xs leading-snug text-red-900">
          <input
            type="checkbox"
            name="tornar_lideranca"
            checked={confirmouLideranca}
            onChange={(e) => setConfirmouLideranca(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <strong>{pessoa?.nome} é colaborador.</strong> Aplicar este perfil faz ele{" "}
            <strong>entrar no Modo Liderança</strong> e usar as permissões marcadas nele. Confirmo
            que é isso mesmo. <em>Se a ideia era liberar módulos do app, use um perfil do tipo
            Colaborador.</em>
          </span>
        </label>
      )}

      <fieldset className="flex flex-wrap gap-2 text-xs">
        <legend className="sr-only">Como aplicar</legend>
        <Modo
          escolhido={!espelhar}
          onClick={() => setEspelhar(false)}
          titulo="Somar"
          ajuda="Acrescenta o que falta. Não tira nada."
        />
        {podeEspelhar && (
          <Modo
            escolhido={espelhar}
            onClick={() => setEspelhar(true)}
            titulo="Espelhar"
            ajuda="Deixa igual ao perfil: acrescenta o que falta e tira o que sobra."
          />
        )}
      </fieldset>

      {pessoaId && (
        <div
          className={`rounded-xl p-3 text-xs leading-relaxed ${
            espelhar && sairiam.length > 0 ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600"
          }`}
        >
          {entrariam.length > 0 ? (
            <p>
              <strong>Entram {entrariam.length}</strong> {unidade}.
            </p>
          ) : (
            <p>Nada novo — a pessoa já tem tudo o que o perfil dá.</p>
          )}
          {sairiam.length > 0 &&
            (espelhar ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold">Saem {sairiam.length} — ver quais</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {sairiam.map((c) => (
                    <li key={c}>{nomeDaConcessao(c)}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-1">
                Ela tem {sairiam.length} {unidade} fora deste perfil — no modo Somar elas ficam.
              </p>
            ))}
        </div>
      )}
    </form>
  );
}

function Modo({
  escolhido,
  onClick,
  titulo,
  ajuda,
}: {
  escolhido: boolean;
  onClick: () => void;
  titulo: string;
  ajuda: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={escolhido}
      className={`flex-1 rounded-xl border p-2 text-left ${
        escolhido ? "border-primary bg-primary-soft" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <span className={`block font-bold ${escolhido ? "text-primary-dark" : "text-slate-700"}`}>
        {escolhido ? "● " : "○ "}
        {titulo}
      </span>
      <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{ajuda}</span>
    </button>
  );
}
