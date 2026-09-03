"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

export type PessoaParaPerfil = { id: string; nome: string; cargo: string | null };

/**
 * Aplicar um perfil a alguém -- somando ou espelhando.
 *
 * O espelhar é o modo que TIRA, e um acesso que some sem aviso é a pior
 * coisa que esta tela pode fazer: quem perdeu não sabe que perdeu, e
 * quem tirou não sabe que tirou. Descobre-se dias depois, com alguém
 * dizendo que "sumiu um botão".
 *
 * Por isso a conta é feita AQUI, antes de enviar, com os dados que a
 * página já tinha em mãos: escolhida a pessoa, a tela lista nominalmente
 * o que vai sair e a confirmação é sobre essa lista. Quem lê e mesmo
 * assim confirma, confirmou aquilo -- não "aplicar o perfil".
 *
 * Somar continua sendo o padrão, porque é o modo que não desfaz nada.
 */
export function AplicarPerfil({
  action,
  perfilId,
  perfilNome,
  pessoas,
  /** As concessões do perfil, como "modulo:acao". */
  doPerfil,
  /** O que cada pessoa já tem NESTA revenda, no mesmo formato. Só entram
   *  as pessoas que têm alguma coisa -- as demais não perdem nada por
   *  definição. */
  jaTem,
  /** "comunicados:ver" -> "Jornal / Comunicados · Ver". */
  rotulos,
}: {
  action: (formData: FormData) => void;
  perfilId: string;
  perfilNome: string;
  pessoas: PessoaParaPerfil[];
  doPerfil: string[];
  jaTem: Record<string, string[]>;
  rotulos: Record<string, string>;
}) {
  const [pessoaId, setPessoaId] = useState("");
  const [espelhar, setEspelhar] = useState(false);
  const confirmarEnvio = useConfirmarEnvio();

  const noPerfil = new Set(doPerfil);
  const atuais = jaTem[pessoaId] ?? [];
  const sairiam = atuais.filter((c) => !noPerfil.has(c));
  const entrariam = doPerfil.filter((c) => !atuais.includes(c));
  const pessoa = pessoas.find((p) => p.id === pessoaId);

  const nomeDaConcessao = (c: string) => rotulos[c] ?? c;

  const pedido = () => {
    if (!espelhar) {
      return {
        titulo: `Somar "${perfilNome}" a ${pessoa?.nome ?? "esta pessoa"}?`,
        detalhe:
          entrariam.length === 0
            ? "Ela já tem tudo o que este perfil dá. Nada mudaria."
            : `Entram ${entrariam.length} permissão(ões). Nada é retirado.`,
        confirmar: "Somar",
        perigo: false,
      };
    }
    if (sairiam.length === 0) {
      return {
        titulo: `Deixar ${pessoa?.nome ?? "esta pessoa"} igual a "${perfilNome}"?`,
        detalhe:
          entrariam.length === 0
            ? "Ela já está exatamente igual ao perfil. Nada mudaria."
            : `Entram ${entrariam.length} permissão(ões), e não há nada sobrando para retirar.`,
        confirmar: "Espelhar",
        perigo: false,
      };
    }
    return {
      titulo: `${pessoa?.nome ?? "Esta pessoa"} vai PERDER ${sairiam.length} permissão(ões)`,
      detalhe:
        `Estas saem por não estarem em "${perfilNome}": ` +
        // Lista nominal, não um número. Cinco cabem numa caixa que se lê
        // de relance; acima disso o resto vira contagem, e quem precisa
        // ver tudo tem a lista aberta na própria tela.
        sairiam.slice(0, 5).map(nomeDaConcessao).join("; ") +
        (sairiam.length > 5 ? ` e mais ${sairiam.length - 5}.` : ".") +
        (entrariam.length > 0 ? ` Entram ${entrariam.length}.` : ""),
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

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            className="mb-1 block text-xs font-medium text-slate-600"
            htmlFor={`pessoa-${perfilId}`}
          >
            Aplicar a
          </label>
          <select
            id={`pessoa-${perfilId}`}
            name="colaborador_id"
            required
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
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
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white ${
            espelhar && sairiam.length > 0
              ? "bg-red-600 hover:bg-red-700"
              : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {espelhar ? "Espelhar" : "Somar"}
        </BotaoEnviar>
      </div>

      {/* Dois modos, um ao lado do outro, com a diferença escrita -- e não
          um interruptor chamado "espelhar" que só quem já sabe entende. */}
      <fieldset className="flex flex-wrap gap-2 text-xs">
        <legend className="sr-only">Como aplicar</legend>
        <Modo
          escolhido={!espelhar}
          onClick={() => setEspelhar(false)}
          titulo="Somar"
          ajuda="Acrescenta o que falta. Não tira nada."
        />
        <Modo
          escolhido={espelhar}
          onClick={() => setEspelhar(true)}
          titulo="Espelhar"
          ajuda="Deixa igual ao perfil: acrescenta o que falta e tira o que sobra."
        />
      </fieldset>

      {pessoaId && (
        <div
          className={`rounded-xl p-3 text-xs leading-relaxed ${
            espelhar && sairiam.length > 0
              ? "bg-red-50 text-red-800"
              : "bg-slate-50 text-slate-600"
          }`}
        >
          {entrariam.length > 0 ? (
            <p>
              <strong>Entram {entrariam.length}</strong> permissão(ões).
            </p>
          ) : (
            <p>Nenhuma permissão nova — ela já tem tudo o que o perfil dá.</p>
          )}

          {sairiam.length > 0 &&
            (espelhar ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold">
                  Saem {sairiam.length} — ver quais
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {sairiam.map((c) => (
                    <li key={c}>{nomeDaConcessao(c)}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-1">
                Ela tem {sairiam.length} permissão(ões) fora deste perfil —
                no modo Somar elas ficam.
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
        escolhido
          ? "border-primary bg-primary-soft"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <span
        className={`block font-bold ${escolhido ? "text-primary-dark" : "text-slate-700"}`}
      >
        {escolhido ? "● " : "○ "}
        {titulo}
      </span>
      <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
        {ajuda}
      </span>
    </button>
  );
}
