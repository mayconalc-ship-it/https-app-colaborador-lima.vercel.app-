"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { CampoFoto } from "@/components/CampoFoto";
import { PRIORIDADES } from "@/lib/chamados";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type Acao = (formData: FormData) => Promise<ResultadoAcao | void>;

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const gaveta = "group rounded-2xl border border-slate-200 bg-white shadow-sm open:border-primary/40";
const tituloGaveta =
  "flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden";

/**
 * O QUE O TIME DA MANUTENÇÃO FAZ COM O CHAMADO.
 *
 * Um botão grande para o próximo passo natural (assumir, concluir) e o
 * resto em gavetas -- quem está com a mão suja no telhado precisa achar
 * o "Concluir" sem ler a tela inteira.
 */
export function AcoesDoAtendente({
  id,
  status,
  prioridade,
  assumir,
  aguardar,
  concluir,
  mudarPrioridade,
  cancelar,
}: {
  id: string;
  status: string;
  prioridade: string;
  assumir: Acao;
  aguardar: Acao;
  concluir: Acao;
  mudarPrioridade: Acao;
  cancelar: Acao;
}) {
  if (status === "concluido" || status === "cancelado") return null;

  return (
    <section className="space-y-2 rounded-2xl border-2 border-primary/30 bg-primary-soft/30 p-3">
      <p className="px-1 text-xs font-bold uppercase tracking-wide text-primary-dark">🔧 Atendimento</p>

      {(status === "aberto" || status === "aguardando") && (
        <BotaoNoLugar
          acao={assumir}
          campos={{ id }}
          textoEnviando="Assumindo..."
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
        >
          {status === "aberto" ? "🙋 Assumir o chamado" : "▶️ Retomar o atendimento"}
        </BotaoNoLugar>
      )}

      <details className={gaveta} open={status === "em_atendimento"}>
        <summary className={tituloGaveta}>
          ✅ Concluir o serviço <span className="text-slate-300 group-open:rotate-90">›</span>
        </summary>
        <FormNoLugar acao={concluir} className="space-y-3 px-4 pb-4">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">O que foi feito</span>
            <textarea
              name="solucao"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              placeholder="Ex.: troquei o reator e as duas lâmpadas da doca 3."
              className={campo}
            />
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Foto do serviço pronto (opcional)</span>
            <CampoFoto name="fotos" accept="image/*" capture="environment" multiple />
          </div>
          <BotaoEnviar
            textoEnviando="Concluindo..."
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
          >
            ✅ Concluir e avisar quem pediu
          </BotaoEnviar>
          <p className="text-[11px] text-slate-500">Quem abriu confirma se resolveu. Se disser que não, o chamado volta para a fila.</p>
        </FormNoLugar>
      </details>

      {status !== "aguardando" && (
        <details className={gaveta}>
          <summary className={tituloGaveta}>
            ⏸️ Pausar: aguardando material ou terceiro <span className="text-slate-300 group-open:rotate-90">›</span>
          </summary>
          <FormNoLugar acao={aguardar} fecharAoSalvar className="space-y-3 px-4 pb-4">
            <input type="hidden" name="id" value={id} />
            <textarea
              name="motivo"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Ex.: reator encomendado, chega quinta."
              className={campo}
            />
            <BotaoEnviar
              textoEnviando="Salvando..."
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-amber-950 hover:bg-amber-400"
            >
              ⏸️ Pausar
            </BotaoEnviar>
          </FormNoLugar>
        </details>
      )}

      <details className={gaveta}>
        <summary className={tituloGaveta}>
          🚦 Mudar a prioridade <span className="text-slate-300 group-open:rotate-90">›</span>
        </summary>
        <FormNoLugar acao={mudarPrioridade} fecharAoSalvar className="space-y-3 px-4 pb-4">
          <input type="hidden" name="id" value={id} />
          <select name="prioridade" defaultValue={prioridade} className={campo}>
            {PRIORIDADES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo} — {p.explica}
              </option>
            ))}
          </select>
          <input name="motivo" maxLength={300} placeholder="Por quê? (opcional)" className={campo} />
          <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
            Salvar a prioridade
          </BotaoEnviar>
          <p className="text-[11px] text-slate-500">O prazo é recalculado a partir da abertura.</p>
        </FormNoLugar>
      </details>

      <details className={gaveta}>
        <summary className={tituloGaveta}>
          <span className="text-red-700">✖️ Cancelar (duplicado, não procede)</span>
          <span className="text-slate-300 group-open:rotate-90">›</span>
        </summary>
        <FormNoLugar
          acao={cancelar}
          confirmacao={{ titulo: "Cancelar este chamado?", detalhe: "Quem abriu é avisado com o motivo.", confirmar: "Cancelar chamado", perigo: true }}
          className="space-y-3 px-4 pb-4"
        >
          <input type="hidden" name="id" value={id} />
          <textarea
            name="motivo"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder="Ex.: duplicado do #0041."
            className={campo}
          />
          <BotaoEnviar textoEnviando="Cancelando..." className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50">
            Cancelar o chamado
          </BotaoEnviar>
        </FormNoLugar>
      </details>
    </section>
  );
}

/**
 * "RESOLVEU?" -- a palavra de quem abriu (DPO 8.2 e 9.1/9.2).
 *
 * Sim fecha de vez, com a nota; Não reabre. As estrelas são opcionais:
 * pedir nota como condição para confirmar faria muita gente desistir de
 * confirmar -- e a confirmação é o que importa mais.
 */
export function ConfirmarAtendimento({ acao, ocultos }: { acao: Acao; ocultos: Record<string, string> }) {
  const [resposta, setResposta] = useState<"sim" | "nao" | null>(null);
  const [nota, setNota] = useState(0);

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-white p-4 shadow-sm">
      <p className="text-base font-bold text-slate-900">A manutenção concluiu. Resolveu o seu problema?</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setResposta("sim")}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-bold ${
            resposta === "sim" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700"
          }`}
        >
          👍 Sim, resolveu
        </button>
        <button
          type="button"
          onClick={() => setResposta("nao")}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-bold ${
            resposta === "nao" ? "border-red-500 bg-red-50 text-red-800" : "border-slate-200 text-slate-700"
          }`}
        >
          👎 Não resolveu
        </button>
      </div>

      {resposta && (
        <FormNoLugar acao={acao} className="mt-4 space-y-3">
          {Object.entries(ocultos).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="resposta" value={resposta} />
          {resposta === "sim" ? (
            <>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Que nota você dá ao atendimento?</p>
                <div className="flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={nota === n}
                      aria-label={`${n} de 5`}
                      onClick={() => setNota(n)}
                      className={`text-4xl leading-none transition ${n <= nota ? "text-amber-400" : "text-slate-200"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <input type="hidden" name="nota" value={nota || ""} />
              </div>
              <input name="comentario" maxLength={500} placeholder="Quer deixar um elogio ou sugestão? (opcional)" className={campo} />
              <BotaoEnviar textoEnviando="Enviando..." className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                Confirmar que resolveu
              </BotaoEnviar>
            </>
          ) : (
            <>
              <textarea
                name="comentario"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="O que continua errado?"
                className={campo}
              />
              <BotaoEnviar textoEnviando="Reabrindo..." className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700">
                ↩️ Reabrir o chamado
              </BotaoEnviar>
            </>
          )}
        </FormNoLugar>
      )}
    </section>
  );
}

/** Um recado na linha do tempo -- da manutenção para quem pediu, e vice-versa. */
export function Comentar({ acao, id }: { acao: Acao; id: string }) {
  return (
    <FormNoLugar acao={acao} limparAoSalvar className="flex items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="texto"
        required
        minLength={2}
        maxLength={1000}
        rows={1}
        placeholder="Escreva um recado no chamado…"
        className={`${campo} min-h-[44px] resize-y`}
      />
      <BotaoEnviar textoEnviando="…" compacto className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark">
        Enviar
      </BotaoEnviar>
    </FormNoLugar>
  );
}

/**
 * O link de acompanhamento de quem abriu SEM login. Montado no navegador
 * (window.location): o servidor não sabe por qual domínio a pessoa entrou.
 */
export function CompartilharAcompanhamento({ protocolo, local }: { protocolo: string; local: string }) {
  const [copiado, setCopiado] = useState(false);
  // Lido na hora do toque, sem o "?novo=1" da primeira visita.
  const endereco = () => `${window.location.origin}${window.location.pathname}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  async function compartilhar() {
    const url = endereco();
    const texto = `Chamado para manutenção ${protocolo} (${local}). Acompanhe aqui: ${url}`;
    // No celular abre a folha de compartilhar do aparelho (WhatsApp,
    // e-mail, o que a pessoa usar); sem ela, o WhatsApp direto.
    if (navigator.share) {
      try {
        await navigator.share({ title: `Chamado ${protocolo}`, text: texto, url });
      } catch {
        // Fechou a folha sem escolher: nada a fazer.
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">Guarde este link para acompanhar</p>
      <p className="mt-0.5 text-xs text-slate-500">É por ele que você vê o andamento e confirma quando a manutenção terminar.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Copy size={15} aria-hidden /> {copiado ? "Link copiado ✅" : "Copiar o link"}
        </button>
        <button
          type="button"
          onClick={compartilhar}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Share2 size={15} aria-hidden /> Mandar para o meu WhatsApp
        </button>
      </div>
    </div>
  );
}
