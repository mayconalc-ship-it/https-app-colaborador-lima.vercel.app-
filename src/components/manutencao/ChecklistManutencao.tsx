"use client";

import { useCallback, useState } from "react";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import {
  CartaoItem,
  type AnteriorDoCartao,
  type RespostaDoCartao,
  type SituacaoDoItem,
} from "@/components/manutencao/CartaoItem";
import { BLOCOS, calcularNotas, formatarPct, tomDaNota, type ItemManut } from "@/lib/manutencao";
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
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // O que cada cartão conta AO VIVO (o toque na nota já conta aqui, antes
  // de o servidor responder) -- é o "5 de 36" do topo.
  const [situacoes, setSituacoes] = useState<Record<string, SituacaoDoItem>>({});
  const [enviando, setEnviando] = useState(0);
  // Itens que entram no filtro ficam nele enquanto o filtro estiver ligado:
  // responder um pendente não pode sumir com o cartão no meio da foto.
  const [fixos, setFixos] = useState<Set<string>>(new Set());

  const aoMudar = useCallback((itemId: string, s: SituacaoDoItem) => setSituacoes((t) => ({ ...t, [itemId]: s })), []);
  const aoEnviando = useCallback((d: number) => setEnviando((n) => Math.max(0, n + d)), []);

  const situacao = (i: ItemManut): SituacaoDoItem => {
    if (situacoes[i.id]) return situacoes[i.id];
    const r = respostas[i.id];
    return r
      ? { respondido: true, nota: r.nota, na: r.na, planoOk: true }
      : { respondido: false, nota: null, na: false, planoOk: true };
  };
  const lista = itens
    .map((i) => ({ itemId: i.id, ...situacao(i) }))
    .filter((x) => x.respondido)
    .map((x) => ({ itemId: x.itemId, nota: x.nota, na: x.na }));
  const notas = calcularNotas(itens, lista);
  const feitos = lista.length;
  const ehAbaixo = (s: SituacaoDoItem) => s.respondido && !s.na && s.nota !== null && s.nota < 3;
  const abaixo = itens.filter((i) => ehAbaixo(situacao(i))).length;
  const semPlano = itens.filter((i) => ehAbaixo(situacao(i)) && !situacao(i).planoOk);
  const comFoto = itens.filter((i) => (respostas[i.id]?.fotos.length ?? 0) > 0).length;
  const pct = itens.length ? feitos / itens.length : 0;

  function filtrar(f: Filtro) {
    setFiltro(f);
    setFixos(
      new Set(
        itens
          .filter((i) => (f === "pendentes" ? !situacao(i).respondido : f === "abaixo" ? ehAbaixo(situacao(i)) : true))
          .map((i) => i.id),
      ),
    );
  }
  const visivel = (i: ItemManut) => filtro === "todos" || fixos.has(i.id);

  return (
    <div>
      {/* ---- Barra que acompanha a rolagem ---- */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:top-[88px]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-slate-800" aria-live="polite">
            <span className="text-2xl font-extrabold tabular-nums text-primary-dark">{feitos}</span>
            <span className="text-sm font-bold"> de {itens.length} respondidas</span>
            <span className="ml-2 text-xs text-slate-500">· {comFoto} com foto</span>
          </p>
          <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${TOM[tomDaNota(notas.total)]}`}>
            {aberta ? "Parcial " : ""}
            {formatarPct(notas.total)}
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={feitos}
          aria-valuemax={itens.length}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <div className="mt-2 flex gap-1.5 text-xs">
          {(
            [
              ["todos", `Todos (${itens.length})`],
              ["pendentes", `Faltam (${itens.length - feitos})`],
              ["abaixo", `Abaixo de 3 (${abaixo})`],
            ] as [Filtro, string][]
          ).map(([f, r]) => (
            <button
              key={f}
              type="button"
              onClick={() => filtrar(f)}
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
          // Os cartões ficam SEMPRE montados; o filtro só esconde. Desmontar
          // perderia a foto na fila ou o texto ainda não salvo do cartão.
          const itensDoBloco = itens.filter((i) => i.bloco === b.id);
          return (
            <section key={b.id} className={itensDoBloco.some(visivel) ? "" : "hidden"}>
              <h2 className="mb-3 flex items-center justify-between rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">
                <span>{b.titulo}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{formatarPct(notas.blocos[b.id])}</span>
              </h2>
              <div className="space-y-6">
                {secoes.map((s) => {
                  const doItem = itensDoBloco.filter((i) => i.secao === s.secao);
                  return (
                    <div key={s.secao} className={doItem.some(visivel) ? "" : "hidden"}>
                      <h3 className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <span>
                          {s.secao}. {s.nome}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 ${TOM[tomDaNota(s.pct)]}`}>{formatarPct(s.pct)}</span>
                      </h3>
                      <div className="space-y-3">
                        {doItem.map((i) => (
                          <div key={i.id} className={visivel(i) ? "" : "hidden"}>
                            <CartaoItem
                              item={i}
                              avaliacaoId={avaliacaoId}
                              resposta={respostas[i.id] ?? null}
                              anterior={anteriores[i.id] ?? null}
                              aberta={aberta}
                              hojeIso={hojeIso}
                              salvar={acoes.salvar}
                              removerFoto={acoes.removerFoto}
                              aoMudar={aoMudar}
                              aoEnviando={aoEnviando}
                            />
                          </div>
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
              Cada item já salva sozinho. Este é o único botão: ele fecha o checklist.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {feitos < itens.length
                ? `Faltam ${itens.length - feitos} de ${itens.length} itens para fechar o ${rotulo}.`
                : semPlano.length > 0
                  ? `Complete o plano de ação (o que, responsável e prazo) ${semPlano.length === 1 ? "do item" : "dos itens"} ${semPlano.map((i) => i.numero).join(", ")}.`
                  : enviando > 0
                    ? "Salvando o último item..."
                    : `Os ${itens.length} itens estão respondidos. Fechar congela a nota do ${rotulo} e coloca o trimestre na evolução.`}
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
                disabled={feitos < itens.length || semPlano.length > 0 || enviando > 0}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                ✅ Fechar o checklist do {rotulo}
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
