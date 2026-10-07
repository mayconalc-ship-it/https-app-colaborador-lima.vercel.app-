"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import {
  CartaoItem,
  type AnteriorDoCartao,
  type RespostaDoCartao,
  type SituacaoDoItem,
} from "@/components/manutencao/CartaoItem";
import type { PessoaDaLista } from "@/components/manutencao/SeletorResponsavel";
import { BLOCOS, calcularNotas, formatarPct, tomDaNota, type Bloco, type ItemManut } from "@/lib/manutencao";
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
 *
 * OS BLOCOS EM SANFONA (07/10/2026, pedido do dono): Fundamentos,
 * Gerenciar para manter e Gerenciar para melhorar viram três faixas que
 * abrem e fecham, cada uma dizendo quanto falta e a nota dela. Abre
 * sozinho o primeiro bloco que ainda tem item pendente; no fim de cada
 * bloco, um toque leva ao próximo. Com filtro ligado, abrem os blocos que
 * têm o que o filtro mostra.
 */
export function ChecklistManutencao({
  avaliacaoId,
  rotulo,
  itens,
  respostas,
  anteriores,
  aberta,
  podeReabrir,
  pessoas,
  ultimoItemId = null,
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
  pessoas: PessoaDaLista[];
  /** A última pergunta respondida (avaliação aberta): a tela começa nela. */
  ultimoItemId?: string | null;
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
      ? { respondido: true, nota: r.nota, na: r.na, planoOk: true, fotosPendentes: 0 }
      : { respondido: false, nota: null, na: false, planoOk: true, fotosPendentes: 0 };
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
  const fotosNoCelular = itens.reduce((n, i) => n + situacao(i).fotosPendentes, 0);
  const pct = itens.length ? feitos / itens.length : 0;

  // Sanfona: abre o primeiro bloco com item pendente (ou o primeiro).
  // Voltando para uma ronda já começada, abre o bloco da última pergunta
  // respondida (pedido do dono, 07/10/2026: "iniciar de onde parou").
  const ultimoItem = ultimoItemId ? itens.find((i) => i.id === ultimoItemId) : undefined;
  const [abertos, setAbertos] = useState<Set<Bloco>>(() => {
    if (ultimoItem) return new Set([ultimoItem.bloco]);
    const comPendente = BLOCOS.find((b) => itens.some((i) => i.bloco === b.id && !respostas[i.id]));
    return new Set([comPendente?.id ?? BLOCOS[0].id]);
  });
  // ...e leva a tela até ela, marcada por uns segundos para o olho achar.
  const [destaque, setDestaque] = useState<string | null>(ultimoItem?.id ?? null);
  useEffect(() => {
    if (!ultimoItem) return;
    // Depois de o Next terminar a própria rolagem da navegação.
    const ir = setTimeout(
      // Pulo direto (sem animação): ao entrar, a pessoa quer já estar lá.
      () => document.getElementById("onde-parou")?.scrollIntoView({ block: "start" }),
      250,
    );
    const apagar = setTimeout(() => setDestaque(null), 4000);
    return () => {
      clearTimeout(ir);
      clearTimeout(apagar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao entrar
  }, []);
  function alternar(b: Bloco) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });
  }
  function irPara(b: Bloco) {
    setAbertos(new Set([b]));
    // Depois de o bloco abrir: a faixa dele vai para o topo.
    requestAnimationFrame(() => document.getElementById(`bloco-${b}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Foto ainda não confirmada pelo servidor: sair da página pergunta antes.
  // (Mesmo saindo, ela está guardada no celular e sobe na volta.)
  useEffect(() => {
    if (fotosNoCelular === 0 && enviando === 0) return;
    const segurar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [fotosNoCelular, enviando]);

  function filtrar(f: Filtro) {
    const ids = new Set(
      itens
        .filter((i) => (f === "pendentes" ? !situacao(i).respondido : f === "abaixo" ? ehAbaixo(situacao(i)) : true))
        .map((i) => i.id),
    );
    setFiltro(f);
    setFixos(ids);
    if (f !== "todos") setAbertos(new Set(itens.filter((i) => ids.has(i.id)).map((i) => i.bloco)));
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
      <div className="space-y-3">
        {BLOCOS.map((b, posicao) => {
          const secoes = notas.secoes.filter((s) => s.bloco === b.id);
          // Os cartões ficam SEMPRE montados; o filtro e a sanfona só
          // escondem. Desmontar perderia a foto na fila ou o texto ainda
          // não salvo do cartão.
          const itensDoBloco = itens.filter((i) => i.bloco === b.id);
          const feitosDoBloco = itensDoBloco.filter((i) => situacao(i).respondido).length;
          const completo = feitosDoBloco === itensDoBloco.length;
          const aberto = abertos.has(b.id);
          const proximo = BLOCOS[posicao + 1];
          return (
            <section key={b.id} id={`bloco-${b.id}`} className={`scroll-mt-40 ${itensDoBloco.some(visivel) ? "" : "hidden"}`}>
              <h2>
                <button
                  type="button"
                  onClick={() => alternar(b.id)}
                  aria-expanded={aberto}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white shadow-sm transition-colors ${
                    aberto ? "bg-primary-dark" : "bg-primary hover:bg-primary-dark"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold uppercase tracking-wide">{b.titulo}</span>
                    <span className="block text-xs font-medium text-white/80">
                      {completo ? "✓ " : ""}
                      {feitosDoBloco} de {itensDoBloco.length} respondidas · {secoes.length}{" "}
                      {secoes.length === 1 ? "seção" : "seções"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                    {formatarPct(notas.blocos[b.id])}
                  </span>
                  <ChevronDown size={20} aria-hidden className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
                </button>
              </h2>
              <div className={`mt-3 space-y-6 ${aberto ? "" : "hidden"}`}>
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
                          <div
                            key={i.id}
                            id={destaque === i.id ? "onde-parou" : undefined}
                            className={`${visivel(i) ? "" : "hidden"} scroll-mt-48 rounded-2xl transition-shadow duration-700 ${
                              destaque === i.id ? "ring-4 ring-primary/50" : ""
                            }`}
                          >
                            {destaque === i.id && (
                              <p className="px-2 pb-1 pt-2 text-xs font-bold text-primary-dark">↓ Você parou aqui</p>
                            )}
                            <CartaoItem
                              item={i}
                              avaliacaoId={avaliacaoId}
                              resposta={respostas[i.id] ?? null}
                              anterior={anteriores[i.id] ?? null}
                              aberta={aberta}
                              hojeIso={hojeIso}
                              pessoas={pessoas}
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
                {filtro === "todos" && (
                  <button
                    type="button"
                    onClick={() => (proximo ? irPara(proximo.id) : alternar(b.id))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-primary/30 bg-white px-4 py-3 text-sm font-semibold text-primary-dark hover:bg-primary-soft"
                  >
                    {proximo ? `Ir para ${proximo.titulo} ›` : `Fechar ${b.titulo} ▲`}
                  </button>
                )}
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
                  : fotosNoCelular > 0
                    ? `${fotosNoCelular === 1 ? "1 foto ainda não subiu" : `${fotosNoCelular} fotos ainda não subiram`} (estão guardadas no celular). Espere o sinal para fechar.`
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
                disabled={feitos < itens.length || semPlano.length > 0 || fotosNoCelular > 0 || enviando > 0}
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
