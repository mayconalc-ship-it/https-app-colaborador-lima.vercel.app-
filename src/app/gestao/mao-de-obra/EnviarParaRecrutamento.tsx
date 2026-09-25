"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { assuntoDoEmailDeVagas, textoDoEmailDeVagas, type VagaDaFuncao } from "@/lib/mao-de-obra";
import { registrarEnvio } from "./actions";

/**
 * O QUADRO DE VAGAS PARA O RECRUTAMENTO (25/09/2026).
 *
 * DUAS SAÍDAS, como no relato da Blitz: "Abrir no e-mail" resolve para
 * quem tem o Outlook configurado; "Copiar" resolve para quem usa webmail.
 * O app não envia -- montar SMTP daria um remetente que ninguém reconhece,
 * e assim o e-mail sai do endereço da própria pessoa.
 *
 * O botão de registrar é separado do de abrir: registrar é o que vira
 * evidência, e ninguém deve registrar um envio que não fez.
 */
export function EnviarParaRecrutamento({
  competencia,
  revenda,
  vagas,
  volumeNegociado,
  destinatarios,
  quemEnvia,
  podeEditar,
}: {
  competencia: string;
  revenda: string;
  vagas: VagaDaFuncao[];
  volumeNegociado: number | null;
  destinatarios: string[];
  quemEnvia: string;
  podeEditar: boolean;
}) {
  const [observacao, setObservacao] = useState("");
  const [copiado, setCopiado] = useState(false);

  const total = vagas.reduce((s, v) => s + v.vagas, 0);
  const texto = textoDoEmailDeVagas({ revenda, competencia, vagas, volumeNegociado, observacao, quemEnvia });
  const assunto = assuntoDoEmailDeVagas(revenda, competencia, total);
  const mailto = `mailto:${destinatarios.join(",")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">
          Observação para o recrutamento (opcional)
        </span>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ex.: prioridade para ajudante de armazém, início previsto para o dia 10."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </label>

      <pre className="max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
        {texto}
      </pre>

      <div className="flex flex-wrap gap-2">
        <a
          href={destinatarios.length > 0 ? mailto : undefined}
          aria-disabled={destinatarios.length === 0}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            destinatarios.length > 0
              ? "bg-primary text-white hover:bg-primary-dark"
              : "pointer-events-none bg-slate-200 text-slate-400"
          }`}
        >
          ✉️ Abrir no e-mail
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2500);
            } catch {
              setCopiado(false);
            }
          }}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-primary"
        >
          {copiado ? "✅ Copiado" : "📋 Copiar o texto"}
        </button>
        {podeEditar && (
          <form action={registrarEnvio}>
            <input type="hidden" name="competencia" value={competencia} />
            <input type="hidden" name="observacao" value={observacao} />
            <BotaoEnviar
              textoEnviando="Registrando..."
              className="rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              ✅ Registrar que enviei
            </BotaoEnviar>
          </form>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        {destinatarios.length === 0
          ? "Cadastre pelo menos um e-mail para liberar o envio."
          : `Vai para: ${destinatarios.join(", ")}`}
      </p>
    </div>
  );
}
