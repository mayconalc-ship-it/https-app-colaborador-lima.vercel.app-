"use client";

import { useEffect, useRef, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { CampoFoto } from "@/components/CampoFoto";
import {
  FASES,
  NOTA_MAX,
  NOTA_MIN,
  emAlerta,
  erroDaResposta,
  itemVisivel,
  paraNumero,
  textoDaFaixa,
  type ItemPreventiva,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";
import { finalizarPreventiva } from "../actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Só o que o formulário precisa guardar enquanto a pessoa digita. */
type Rascunho = {
  bool?: boolean | null;
  texto?: string;
  numero?: string;
  fases?: [string, string, string];
  obs?: string;
};

/** Rascunho guardado no celular: some sozinho depois de 7 dias. */
const PREFIXO = "preventiva-rascunho:";
const VALIDADE = 7 * 86_400_000;

function lerRascunho(chave: string): { itens: Record<string, Rascunho>; geral: string } | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const r = JSON.parse(bruto);
    if (Date.now() - (r.em ?? 0) > VALIDADE) return null;
    return { itens: r.itens ?? {}, geral: r.geral ?? "" };
  } catch {
    return null;
  }
}

function limparVelhos() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      const em = JSON.parse(localStorage.getItem(k) ?? "{}").em ?? 0;
      if (Date.now() - em > VALIDADE) localStorage.removeItem(k);
    }
  } catch {
    // sem armazenamento: segue sem rascunho
  }
}

function paraResposta(item: ItemPreventiva, d: Rascunho): RespostaPreventiva {
  const fases = d.fases?.map(paraNumero);
  return {
    itemId: item.id,
    valorBool: d.bool ?? null,
    valorNumero: item.tipo === "numero" || item.tipo === "nota" ? paraNumero(d.numero) : null,
    valorNumeros:
      item.tipo === "trifasico" && fases && fases.every((n) => n !== null && n !== undefined) ? (fases as number[]) : null,
    valorTexto: item.tipo === "opcao" || item.tipo === "texto" ? (d.texto ?? null) : null,
    observacao: null,
  };
}

/**
 * A preventiva inteira com um Salvar só no fim (16/11/2026: blocos,
 * progresso, foto por item e alerta).
 *
 * - O que está fora do normal fica vermelho NA HORA e abre a observação:
 *   é ali que nasce o chamado de conserto.
 * - O que se digita fica guardado no celular a cada toque: se o Android
 *   fechar o navegador no meio, as respostas voltam (a foto não -- é
 *   arquivo, e o navegador não deixa guardar).
 * - As perguntas condicionais somem e aparecem enquanto se responde.
 */
export function FormPreventiva({ execucaoId, itens }: { execucaoId: string; itens: ItemPreventiva[] }) {
  const chave = `${PREFIXO}${execucaoId}`;
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [geral, setGeral] = useState("");
  const [recuperado, setRecuperado] = useState(false);
  const carregou = useRef(false);

  useEffect(() => {
    limparVelhos();
    const r = lerRascunho(chave);
    if (r && Object.keys(r.itens).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento do celular
      setRascunhos(r.itens);
      setGeral(r.geral);
      setRecuperado(true);
    }
    carregou.current = true;
  }, [chave]);

  useEffect(() => {
    if (!carregou.current) return;
    try {
      localStorage.setItem(chave, JSON.stringify({ em: Date.now(), itens: rascunhos, geral }));
    } catch {
      // cheio ou bloqueado: segue sem rascunho
    }
  }, [chave, rascunhos, geral]);

  function mudar(itemId: string, patch: Rascunho) {
    setRascunhos((a) => ({ ...a, [itemId]: { ...a[itemId], ...patch } }));
  }

  const respostas = new Map<string, RespostaPreventiva>();
  for (const item of itens) respostas.set(item.id, paraResposta(item, rascunhos[item.id] ?? {}));

  const visiveis = itens.filter((i) => itemVisivel(i, itens, respostas));
  const respondidas = visiveis.filter((i) => erroDaResposta(i, respostas.get(i.id)) === null).length;
  const alertas = visiveis.filter((i) => emAlerta(i, respostas.get(i.id))).length;
  const pct = visiveis.length ? Math.round((respondidas / visiveis.length) * 100) : 0;

  return (
    <form action={finalizarPreventiva} className="space-y-3">
      <input type="hidden" name="execucao_id" value={execucaoId} />

      {recuperado && (
        <p className="rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900">
          ↩️ Suas respostas foram recuperadas deste celular. Confira as fotos antes de finalizar.
        </p>
      )}

      {visiveis.map((item, i) => {
        const d = rascunhos[item.id] ?? {};
        const r = respostas.get(item.id);
        const alerta = emAlerta(item, r);
        const faixa = item.tipo === "numero" || item.tipo === "trifasico" ? textoDaFaixa(item) : null;
        const novoBloco = item.bloco && item.bloco !== visiveis[i - 1]?.bloco;
        return (
          <div key={item.id}>
            {novoBloco && (
              <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500 first:mt-0">{item.bloco}</h2>
            )}
            <div
              className={`space-y-2.5 rounded-2xl border p-3.5 shadow-sm transition ${
                alerta ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  <span className="mr-1 text-slate-400">{i + 1}.</span>
                  {item.pergunta}
                  {!item.obrigatorio && <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>}
                </p>
                {(item.ajuda || faixa) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.ajuda}
                    {item.ajuda && faixa ? " " : ""}
                    {faixa && !item.ajuda?.includes(faixa) && <span className="font-semibold">Normal: {faixa}.</span>}
                  </p>
                )}
              </div>

              {item.tipo === "sim_nao" && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "true", r: "Sim" },
                    { v: "false", r: "Não" },
                  ].map(({ v, r: rot }) => {
                    const marcado = String(d.bool) === v;
                    const ruim = item.alertaValores.includes(v);
                    return (
                      <label
                        key={v}
                        className={`flex cursor-pointer items-center justify-center rounded-xl border-2 py-3 text-sm font-semibold ${
                          marcado
                            ? ruim
                              ? "border-red-400 bg-red-50 text-red-800"
                              : "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`item_${item.id}`}
                          value={v}
                          checked={marcado}
                          onChange={() => mudar(item.id, { bool: v === "true" })}
                          className="sr-only"
                          required={item.obrigatorio}
                        />
                        {rot}
                      </label>
                    );
                  })}
                </div>
              )}

              {item.tipo === "numero" && (
                <div className="flex items-center gap-2">
                  <input
                    name={`item_${item.id}`}
                    type="text"
                    inputMode="decimal"
                    value={d.numero ?? ""}
                    onChange={(e) => mudar(item.id, { numero: e.target.value })}
                    placeholder={item.casasDecimais > 0 ? `0,${"0".repeat(item.casasDecimais)}` : "0"}
                    required={item.obrigatorio}
                    className={`${campo} max-w-40 ${alerta ? "border-red-400" : ""}`}
                  />
                  {item.unidade && <span className="text-sm font-semibold text-slate-500">{item.unidade}</span>}
                </div>
              )}

              {/* Três campos separados, não uma frase. No Forms isso era
                  texto livre e saiu "L3: 22" -- era 220, e ninguém viu. */}
              {item.tipo === "trifasico" && (
                <div className="grid grid-cols-3 gap-2">
                  {FASES.map((fase, idx) => (
                    <div key={fase}>
                      <label className={rotulo} htmlFor={`item_${item.id}_${fase.toLowerCase()}`}>
                        {fase}
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          id={`item_${item.id}_${fase.toLowerCase()}`}
                          name={`item_${item.id}_${fase.toLowerCase()}`}
                          type="text"
                          inputMode="decimal"
                          value={d.fases?.[idx] ?? ""}
                          onChange={(e) => {
                            const atual = [...(d.fases ?? ["", "", ""])] as [string, string, string];
                            atual[idx] = e.target.value;
                            mudar(item.id, { fases: atual });
                          }}
                          placeholder="220"
                          required={item.obrigatorio}
                          className={campo}
                        />
                        {item.unidade && <span className="text-xs text-slate-400">{item.unidade}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {item.tipo === "opcao" && (
                <div className="flex flex-wrap gap-2">
                  {item.opcoes.map((o) => {
                    const marcado = d.texto === o;
                    const ruim = item.alertaValores.includes(o);
                    return (
                      <label
                        key={o}
                        className={`cursor-pointer rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
                          marcado
                            ? ruim
                              ? "border-red-400 bg-red-50 text-red-800"
                              : "border-primary bg-primary-soft text-primary-dark"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`item_${item.id}`}
                          value={o}
                          checked={marcado}
                          onChange={() => mudar(item.id, { texto: o })}
                          className="sr-only"
                          required={item.obrigatorio}
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}

              {item.tipo === "nota" && (
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: NOTA_MAX - NOTA_MIN + 1 }, (_, k) => NOTA_MIN + k).map((n) => (
                    <label
                      key={n}
                      className={`flex cursor-pointer items-center justify-center rounded-xl border-2 py-3 text-base font-bold ${
                        d.numero === String(n)
                          ? "border-primary bg-primary-soft text-primary-dark"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`item_${item.id}`}
                        value={n}
                        checked={d.numero === String(n)}
                        onChange={() => mudar(item.id, { numero: String(n) })}
                        className="sr-only"
                        required={item.obrigatorio}
                      />
                      {n}
                    </label>
                  ))}
                </div>
              )}

              {item.tipo === "texto" && (
                <textarea
                  name={`item_${item.id}`}
                  rows={2}
                  maxLength={500}
                  value={d.texto ?? ""}
                  onChange={(e) => mudar(item.id, { texto: e.target.value })}
                  required={item.obrigatorio}
                  className={campo}
                />
              )}

              {alerta && (
                <p className="text-xs font-semibold text-red-700">⚠️ Fora do normal. Descreva o que viu{item.aceitaFoto ? " e tire a foto" : ""}.</p>
              )}

              {/* Foto e observação lado a lado, discretas até serem úteis. */}
              <div className="flex items-start gap-2">
                {item.aceitaFoto && (
                  <CampoFoto
                    name={`foto_${item.id}`}
                    accept="image/*"
                    capture="environment"
                    ladoMaior={1280}
                    qualidade={0.7}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {alerta || d.obs ? (
                    <textarea
                      name={`obs_${item.id}`}
                      rows={2}
                      maxLength={500}
                      value={d.obs ?? ""}
                      onChange={(e) => mudar(item.id, { obs: e.target.value })}
                      placeholder={alerta ? "O que está errado? O que foi feito?" : "Observação"}
                      className={`${campo} text-sm`}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => mudar(item.id, { obs: " " })}
                      className="py-1 text-xs font-semibold text-primary"
                    >
                      + Observação
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <label className={rotulo} htmlFor="observacao">
          Observação geral (opcional)
        </label>
        <textarea
          id="observacao"
          name="observacao"
          rows={2}
          maxLength={1000}
          value={geral}
          onChange={(e) => setGeral(e.target.value)}
          className={campo}
        />
      </div>

      {/* O progresso e o botão ficam presos no rodapé enquanto se rola. */}
      <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>
            {respondidas} de {visiveis.length} respondidas
          </span>
          {alertas > 0 ? (
            <span className="text-red-700">⚠️ {alertas} em alerta</span>
          ) : (
            respondidas > 0 && <span className="text-emerald-700">Sem alerta</span>
          )}
        </div>
        <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <BotaoEnviar
          textoEnviando="Salvando..."
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
        >
          ✅ Finalizar preventiva
        </BotaoEnviar>
      </div>
    </form>
  );
}
