"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { rotuloCompetencia, textoDaFormalizacao, type VagaDaFuncao } from "@/lib/mao-de-obra";
import { formalizarPlanejamento } from "./actions";

/**
 * FORMALIZAR PARA O TIME DE GENTE (V.2) -- os 3 meses do planejamento.
 *
 * DUAS SAÍDAS, como no relato da Blitz: "Abrir no e-mail" resolve para
 * quem tem o Outlook configurado; "Copiar" resolve para quem usa webmail.
 * O app não envia -- montar SMTP daria um remetente que ninguém reconhece.
 *
 * "Registrar" é separado de "abrir": é ele que vira evidência e congela a
 * projeção para o comparativo (V.3), e ninguém deve registrar um envio
 * que não fez.
 */
export function EnviarParaRecrutamento({
  competencia,
  revenda,
  meses,
  destinatarios,
  quemEnvia,
  podeEditar,
}: {
  competencia: string;
  revenda: string;
  meses: { competencia: string; vagas: VagaDaFuncao[]; volumeNegociado: number | null; volumePpr: number | null }[];
  destinatarios: string[];
  quemEnvia: string;
  podeEditar: boolean;
}) {
  const [observacao, setObservacao] = useState("");
  const [copiado, setCopiado] = useState(false);

  const texto = textoDaFormalizacao({ revenda, meses, observacao, quemEnvia });
  const assunto = `Planejamento de mão de obra — ${revenda} — ${meses.map((m) => rotuloCompetencia(m.competencia)).join(", ")}`;
  const mailto = `mailto:${destinatarios.join(",")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
  const pode = destinatarios.length > 0 && meses.length > 0;

  return (
    <div className="space-y-3">
      <textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Observação para o time de Gente (opcional). Ex.: prioridade para ajudante de armazém."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      <details className="rounded-xl bg-slate-50">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600">
          Ver o texto que vai no e-mail
        </summary>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-slate-700">{texto}</pre>
      </details>

      <div className="flex flex-wrap gap-2">
        <a
          href={pode ? mailto : undefined}
          aria-disabled={!pode}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            pode ? "bg-primary text-white hover:bg-primary-dark" : "pointer-events-none bg-slate-200 text-slate-400"
          }`}
        >
          ✉️ 1. Abrir no e-mail
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
          {copiado ? "✅ Copiado" : "📋 ou copiar o texto"}
        </button>
        {podeEditar && (
          <form action={formalizarPlanejamento}>
            <input type="hidden" name="competencia" value={competencia} />
            <input type="hidden" name="observacao" value={observacao} />
            <BotaoEnviar
              textoEnviando="Registrando..."
              className="rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              ✅ 2. Registrar que enviei
            </BotaoEnviar>
          </form>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        {destinatarios.length === 0
          ? "Cadastre o e-mail do time de Gente na aba Configurar para liberar."
          : `Vai para: ${destinatarios.join(", ")}. Registrar guarda a fotografia dos 3 meses para o comparativo.`}
      </p>
    </div>
  );
}
