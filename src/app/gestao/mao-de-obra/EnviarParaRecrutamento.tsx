"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { diasDaCompetencia, rotuloCompetencia, textoDaFormalizacao, type MesDaFormalizacao } from "@/lib/mao-de-obra";
import { formalizarPlanejamento } from "./actions";

/**
 * FORMALIZAR PARA O TIME DE GENTE (V.2) -- os 3 meses do planejamento.
 *
 * PELO OUTLOOK (28/09/2026, pedido do dono): o botão principal abre o
 * Outlook Web do Microsoft 365 já com destinatários, assunto e texto -- a
 * empresa usa o 365, e o e-mail sai da conta da própria pessoa. O mailto
 * fica como segunda opção, para quem usa o Outlook instalado no computador.
 * O app não envia sozinho: montar SMTP daria um remetente que ninguém
 * reconhece.
 *
 * "Registrar" é separado de "abrir": é ele que vira evidência e congela a
 * projeção para o comparativo (V.3). A DATA DO ENVIO pode ser passada --
 * dentro do mês que se formaliza -- e o registro fica marcado retroativo.
 */
export function EnviarParaRecrutamento({
  competencia,
  revenda,
  meses,
  destinatarios,
  quemEnvia,
  podeEditar,
  hoje,
}: {
  competencia: string;
  revenda: string;
  meses: MesDaFormalizacao[];
  destinatarios: string[];
  quemEnvia: string;
  podeEditar: boolean;
  /** "AAAA-MM-DD" em Brasília. */
  hoje: string;
}) {
  // A data só pode cair no mês que se formaliza, e nunca no futuro.
  const inicio = `${competencia}-01`;
  const fimDoMes = `${competencia}-${String(diasDaCompetencia(competencia)).padStart(2, "0")}`;
  const fim = fimDoMes < hoje ? fimDoMes : hoje;
  const mesJaComecou = inicio <= hoje;

  const [observacao, setObservacao] = useState("");
  const [data, setData] = useState(hoje.slice(0, 7) === competencia ? hoje : inicio);
  const [copiado, setCopiado] = useState(false);

  const texto = textoDaFormalizacao({ revenda, meses, observacao, quemEnvia, data });
  const assunto = `Planejamento de mão de obra — ${revenda} — ${meses.map((m) => rotuloCompetencia(m.competencia)).join(", ")}`;
  const para = destinatarios.join(";");
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(para)}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
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
          href={pode ? outlook : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!pode}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            pode ? "bg-primary text-white hover:bg-primary-dark" : "pointer-events-none bg-slate-200 text-slate-400"
          }`}
        >
          ✉️ 1. Abrir no Outlook
        </a>
        <a
          href={pode ? mailto : undefined}
          aria-disabled={!pode}
          className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
            pode ? "border-slate-300 bg-white text-slate-700 hover:border-primary" : "pointer-events-none border-slate-200 text-slate-400"
          }`}
        >
          Outlook do computador
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
          {copiado ? "✅ Copiado" : "📋 Copiar"}
        </button>
      </div>

      {podeEditar && (
        <form action={formalizarPlanejamento} className="flex flex-wrap items-end gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <input type="hidden" name="competencia" value={competencia} />
          <input type="hidden" name="observacao" value={observacao} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Data do envio</span>
            <input
              type="date"
              name="data_envio"
              value={data}
              min={inicio}
              max={fim}
              onChange={(e) => setData(e.target.value)}
              disabled={!mesJaComecou}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          <BotaoEnviar
            textoEnviando="Registrando..."
            className="rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            ✅ 2. Registrar que enviei
          </BotaoEnviar>
          <p className="w-full text-[11px] text-slate-500">
            {!mesJaComecou
              ? `${rotuloCompetencia(competencia)} ainda não começou: formalize no próprio mês.`
              : `Fica registrado como enviado em ${data.split("-").reverse().join("/")} e guarda a fotografia dos 3 meses para o comparativo.`}
          </p>
        </form>
      )}
      <p className="text-[11px] text-slate-500">
        {destinatarios.length === 0
          ? "Cadastre o e-mail do time de Gente na aba Configurar para liberar."
          : `Vai para: ${destinatarios.join(", ")}.`}
      </p>
    </div>
  );
}
