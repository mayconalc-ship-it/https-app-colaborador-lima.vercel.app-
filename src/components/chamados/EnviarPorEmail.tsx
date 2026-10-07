"use client";

import { useRef, useState } from "react";
import { FormNoLugar } from "@/components/FormNoLugar";
import {
  MOTIVOS_EMAIL,
  assuntoDoPedido,
  textoDoPedido,
  type ChamadoParaEmail,
  type MotivoEmail,
} from "@/lib/chamados";
import type { ResultadoAcao } from "@/lib/resultado-acao";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";

/**
 * "Pedir por e-mail" (07/10/2026). O dono explicou para que serve: "para
 * os casos de necessidade de solicitação para a compra de peça ou
 * autorização do gestor". Então o botão é um PEDIDO: escolhe o motivo,
 * diz o que precisa, e o e-mail sai escrito para a lista daquele motivo
 * (Admin › Chamados).
 *
 * O app não envia sozinho: montar SMTP daria um remetente que ninguém
 * reconhece (mesma decisão da Blitz e da Mão de Obra). Abrir o Outlook --
 * o Web do Microsoft 365, ou o do computador pelo mailto -- também anota
 * o pedido no andamento do chamado, que é a evidência de que foi pedido.
 */
export function EnviarPorEmail({
  chamadoId,
  chamado,
  unidade,
  link,
  quemPede,
  listas,
  registrar,
}: {
  chamadoId: string;
  chamado: ChamadoParaEmail;
  unidade: string;
  link: string;
  quemPede: string;
  listas: Record<MotivoEmail, string[]>;
  registrar: (fd: FormData) => Promise<ResultadoAcao>;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoEmail>("compra");
  const [oQue, setOQue] = useState("");
  const [valor, setValor] = useState("");
  const [copiado, setCopiado] = useState(false);
  const via = useRef<"web" | "mailto">("web");

  const m = MOTIVOS_EMAIL.find((x) => x.id === motivo)!;
  const para = listas[motivo];
  const pedido = { motivo, oQue, valor, quemPede };
  const assunto = assuntoDoPedido(chamado, unidade, pedido);
  const texto = textoDoPedido(chamado, unidade, link, pedido);
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(para.join(";"))}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
  const mailto = `mailto:${para.join(",")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;

  async function abrirOEmail() {
    // Dentro do toque (antes de qualquer espera), ou o navegador bloqueia a janela.
    if (via.current === "web") window.open(outlook, "_blank", "noopener");
    else window.location.href = mailto;
    return true;
  }

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        ✉️ Pedir por e-mail
      </button>

      {aberto && (
        <FormNoLugar
          acao={registrar}
          antesDeEnviar={abrirOEmail}
          aoSalvar={() => {
            setOQue("");
            setValor("");
            setAberto(false);
          }}
          className="mt-2 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <input type="hidden" name="id" value={chamadoId} />
          <input type="hidden" name="motivo" value={motivo} />

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="O que você precisa pedir">
            {MOTIVOS_EMAIL.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={motivo === x.id}
                onClick={() => setMotivo(x.id)}
                className={`rounded-xl border-2 px-2 py-2 text-sm font-semibold ${
                  motivo === x.id ? "border-primary bg-primary-soft text-primary-dark" : "border-slate-200 text-slate-600 hover:border-primary/40"
                }`}
              >
                {x.emoji} {x.rotulo}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{m.pergunta}</span>
            <textarea
              name="o_que"
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              value={oQue}
              onChange={(e) => setOQue(e.target.value)}
              placeholder={m.exemplo}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Valor estimado (opcional)</span>
            <input
              name="valor"
              inputMode="decimal"
              maxLength={20}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="R$ 0,00"
              className={`${campo} sm:w-48`}
            />
          </label>

          <p className="text-xs text-slate-600">
            {para.length > 0 ? (
              <>
                Vai para {m.destino}: <strong className="break-all">{para.join(", ")}</strong>
              </>
            ) : (
              `Nenhum e-mail de ${m.destino} cadastrado em Admin › Chamados: o Outlook abre sem destinatário, para você escolher.`
            )}
          </p>
          <details className="rounded-xl bg-slate-50">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600">Ver o e-mail</summary>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-slate-700">
              {assunto}
              {"\n\n"}
              {texto}
            </pre>
          </details>

          <div className="flex flex-wrap gap-2">
            {/* O clique vem antes do envio: é ele que diz qual Outlook abrir. */}
            <button
              type="submit"
              onClick={() => (via.current = "web")}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Abrir no Outlook
            </button>
            <button
              type="submit"
              onClick={() => (via.current = "mailto")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary"
            >
              Outlook do computador
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${assunto}\n\n${texto}`);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                } catch {
                  setCopiado(false);
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary"
            >
              {copiado ? "✅ Copiado" : "📋 Copiar"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Abrir o e-mail anota o pedido no andamento do chamado. Quer mandar a O.S. junto? Baixe em PDF e anexe.
          </p>
        </FormNoLugar>
      )}
    </div>
  );
}
