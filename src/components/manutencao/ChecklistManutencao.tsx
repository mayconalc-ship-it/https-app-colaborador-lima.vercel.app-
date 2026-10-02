"use client";

import { useState } from "react";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { CartaoItem, type AnteriorDoCartao, type RespostaDoCartao } from "@/components/manutencao/CartaoItem";
import {
  BLOCOS,
  calcularNotas,
  formatarPct,
  tomDaNota,
  type ItemManut,
} from "@/lib/manutencao";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type Filtro = "todos" | "pendentes" | "abaixo";

const TOM: Record<ReturnType<typeof tomDaNota>, string> = {
  bom: "bg-emerald-100 text-emerald-800",
  atencao: "bg-amber-100 text-amber-800",
  ruim: "bg-red-100 text-red-800",
  neutro: "bg-slate-100 text-slate-500",
};

/**
 * O CHECKLIST DO TRIMESTRE, de cima a baixo na ordem da planilha:
 * bloco > seção > item. A barra do topo acompanha a rolagem e responde
 * as duas perguntas de quem está no meio da ronda -- quanto falta e como
 * está a nota -- e os filtros levam direto ao que ainda não foi visto ou
 * ao que ficou abaixo de 3.
 */
export function ChecklistManutencao({
  avaliacaoId,
  rotulo,
  itens,
  respostas,
  anteriores,
  aberta,
  podeReabrir,
  hojeIso,
  acoes,
}: {
  avaliacaoId: string;
  rotulo: string;
  itens: ItemManut[];
  respostas: Record<string, RespostaDoCartao>;
  anteriores: Record<string, AnteriorDoCartao>;
  aberta: boolean;
  podeReabrir: boolean;
  hojeIso: string;
  acoes: {
    salvar: (fd: FormData) => Promise<ResultadoAcao>;
    removerFoto: (fd: FormData) => Promise<ResultadoAcao>;
    finalizar: (fd: FormData) => Promise<ResultadoAcao>;
    reabrir: (fd: FormData) => Promise<ResultadoAcao>;
  };
}) {
  const [filtro, setFiltro] = useState<Filtro>(aberta ? "todos" : "todos");

  const lista = Object.entries(respostas).map(([itemId, r]) => ({ itemId, nota: r.nota, na: r.na }));
  const notas = calcularNotas(itens, lista);
  const feitos = itens.filter((i) => respostas[i.id]).length;
  const abaixo = itens.filter((i) => {
    const r = respostas[i.id];
    return r && !r.na && r.nota !== null && r.nota < 3;
  }).length;
  const comFoto = itens.filter((i) => (respostas[i.id]?.fotos.length ?? 0) > 0).length;
  const pct = itens.length ? feitos / itens.length : 0;

  const visivel = (i: ItemManut) => {
    const r = respostas[i.id];
    if (filtro === "pendentes") return !r;
    if (filtro === "abaixo") return !!r && !r.na && r.nota !== null && r.nota < 3;
    return true;
  };

  return (
    <div>
      {/* ---- Barra que acompanha a rolagem ---- */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:top-[88px]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-800">
            {feitos} de {itens.length} itens
            <span className="ml-2 font-normal text-slate-500">· {comFoto} com foto</span>
          </p>
          <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${TOM[tomDaNota(notas.total)]}`}>
            {aberta ? "Parcial " : ""}
            {formatarPct(notas.total)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={feitos} aria-valuemax={itens.length}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <div className="mt-2 flex gap-1.5 text-xs">
          {(
            [
              ["todos", `Todos (${itens.length})`],
              ["pendentes", `Pendentes (${itens.length - feitos})`],
              ["abaixo", `Abaixo de 3 (${abaixo})`],
            ] as [Filtro, string][]
          ).map(([f, r]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className={`rounded-full px-3 py-1 font-semibold ${
                filtro === f ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Bloco > Seção > Item ---- */}
      <div className="space-y-8">
        {BLOCOS.map((b) => {
          const secoes = notas.secoes.filter((s) => s.bloco === b.id);
          const itensDoBloco = itens.filter((i) => i.bloco === b.id && visivel(i));
          if (itensDoBloco.length === 0) return null;
          return (
            <section key={b.id}>
              <h2 className="mb-3 flex items-center justify-between rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">
                <span>{b.titulo}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{formatarPct(notas.blocos[b.id])}</span>
              </h2>
              <div className="space-y-6">
                {secoes.map((s) => {
                  const doItem = itensDoBloco.filter((i) => i.secao === s.secao);
                  if (doItem.length === 0) return null;
                  return (
                    <div key={s.secao}>
                      <h3 className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <span>
                          {s.secao}. {s.nome}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 ${TOM[tomDaNota(s.pct)]}`}>{formatarPct(s.pct)}</span>
                      </h3>
                      <div className="space-y-3">
                        {doItem.map((i) => (
                          <CartaoItem
                            key={i.id}
                            item={i}
                            avaliacaoId={avaliacaoId}
                            resposta={respostas[i.id] ?? null}
                            anterior={anteriores[i.id] ?? null}
                            aberta={aberta}
                            hojeIso={hojeIso}
                            salvar={acoes.salvar}
                            removerFoto={acoes.removerFoto}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {itens.filter(visivel).length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {filtro === "pendentes" ? "✅ Nenhum item pendente." : "Nenhum item abaixo de 3. 👏"}
          </p>
        )}
      </div>

      {/* ---- Fechar o trimestre ---- */}
      <section className="mt-8 rounded-2xl border-2 border-primary/30 bg-white p-4 shadow-sm">
        {aberta ? (
          <>
            <h2 className="font-semibold text-slate-800">Terminou a ronda?</h2>
            <p className="mt-1 text-sm text-slate-600">
              {feitos === itens.length
                ? `Os ${itens.length} itens estão respondidos. Finalizar congela a nota do ${rotulo} e coloca o trimestre na evolução.`
                : `Faltam ${itens.length - feitos} itens para finalizar o ${rotulo}.`}
            </p>
            <div className="mt-3">
              <BotaoNoLugar
                acao={acoes.finalizar}
                campos={{ avaliacao_id: avaliacaoId }}
                confirmacao={`Finalizar o ${rotulo}?`}
                detalhe={`A nota fica em ${formatarPct(notas.total)} e as respostas ficam travadas. Para corrigir depois, a liderança reabre.`}
                rotuloConfirmar="Finalizar"
                perigo={false}
                textoEnviando="Finalizando..."
                disabled={feitos < itens.length}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                ✅ Finalizar o {rotulo}
              </BotaoNoLugar>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-slate-800">
              {rotulo} finalizado · {formatarPct(notas.total)}
            </h2>
            <p className="mt-1 text-sm text-slate-600">As respostas estão travadas. É este registro que a auditoria vê.</p>
            {podeReabrir && (
              <div className="mt-3">
                <BotaoNoLugar
                  acao={acoes.reabrir}
                  campos={{ avaliacao_id: avaliacaoId }}
                  confirmacao={`Reabrir o ${rotulo} para correção?`}
                  detalhe="A nota sai da evolução até alguém finalizar de novo."
                  rotuloConfirmar="Reabrir"
                  perigo={false}
                  textoEnviando="Reabrindo..."
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ↩️ Reabrir para correção
                </BotaoNoLugar>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
