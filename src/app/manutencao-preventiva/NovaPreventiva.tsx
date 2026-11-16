"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { SeloDoPrazo } from "@/components/manutencao/PrazoDaPreventiva";
import type { Prazo } from "@/lib/manutencao-preventiva";
import { cadastrarEIniciar, iniciarPreventiva } from "./actions";

export type OpcaoDeModelo = {
  id: string;
  nome: string;
  emoji: string;
  equipamento: string;
  usaEquipamentos: boolean;
  aparelhos: { id: string; titulo: string; prazo: Prazo; abertaId: string | null }[];
  /** Modelo sem aparelho (Gerador): a preventiva dele já aberta por você. */
  abertaId: string | null;
};

/**
 * O "+" DA PREVENTIVA (16/11/2026, pedido do dono).
 *
 * Dois toques: o tipo (Ar, Câmara, Gerador) e, quando há cadastro, QUAL
 * aparelho -- cada um com o seu prazo à vista, porque fazer o AC-01 não
 * resolve o AC-02. Quem pode cadastrar inclui o aparelho que faltar ali
 * mesmo e já começa a preventiva dele.
 */
export function NovaPreventiva({ modelos, podeCadastrar }: { modelos: OpcaoDeModelo[]; podeCadastrar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const modelo = modelos.find((m) => m.id === modeloId) ?? null;

  function fechar() {
    setAberto(false);
    setModeloId(null);
    setBusca("");
  }

  const termo = busca.trim().toLowerCase();
  const aparelhos = modelo?.aparelhos.filter((a) => !termo || a.titulo.toLowerCase().includes(termo)) ?? [];
  const emDia = modelo?.aparelhos.filter((a) => a.prazo.estado === "em_dia").length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Nova preventiva"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-95"
      >
        <Plus size={28} strokeWidth={2.5} aria-hidden />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={fechar}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nova preventiva"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                {modelo && (
                  <button type="button" onClick={() => setModeloId(null)} className="text-xs font-semibold text-primary">
                    ← Trocar o tipo
                  </button>
                )}
                <h2 className="truncate text-base font-bold text-slate-900">
                  {modelo ? `${modelo.emoji} Qual ${modelo.equipamento.toLowerCase()}?` : "Nova preventiva"}
                </h2>
                {modelo && modelo.aparelhos.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {emDia} de {modelo.aparelhos.length} em dia · cada aparelho tem o seu prazo
                  </p>
                )}
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
                <X size={20} aria-hidden />
              </button>
            </div>

            {/* Passo 1: o tipo */}
            {!modelo && (
              <ul className="space-y-2">
                {modelos.map((m) => {
                  const vencidos = m.aparelhos.filter((a) => a.prazo.estado === "atrasada" || a.prazo.estado === "vence_hoje").length;
                  const conteudo = (
                    <>
                      <span className="text-2xl" aria-hidden>
                        {m.emoji}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-bold text-slate-900">{m.equipamento || m.nome}</span>
                        <span className="block text-xs text-slate-500">
                          {m.usaEquipamentos
                            ? m.aparelhos.length === 0
                              ? "Nenhum aparelho cadastrado"
                              : `${m.aparelhos.length} aparelho${m.aparelhos.length === 1 ? "" : "s"}${vencidos ? ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}` : ""}`
                            : m.abertaId
                              ? "Você já começou: continuar"
                              : "Começar agora"}
                        </span>
                      </span>
                      <span className="text-slate-300" aria-hidden>
                        ›
                      </span>
                    </>
                  );
                  const classe =
                    "flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:border-primary hover:bg-primary-soft/30";
                  return (
                    <li key={m.id}>
                      {m.usaEquipamentos ? (
                        <button type="button" onClick={() => setModeloId(m.id)} className={classe}>
                          {conteudo}
                        </button>
                      ) : m.abertaId ? (
                        <Link href={`/manutencao-preventiva/${m.abertaId}`} className={classe}>
                          {conteudo}
                        </Link>
                      ) : (
                        <form action={iniciarPreventiva}>
                          <input type="hidden" name="modelo_id" value={m.id} />
                          <BotaoEnviar textoEnviando="Abrindo..." className={classe}>
                            {conteudo}
                          </BotaoEnviar>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Passo 2: o aparelho */}
            {modelo && (
              <div>
                {modelo.aparelhos.length > 6 && (
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar código ou local"
                    className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                )}
                {modelo.aparelhos.length === 0 && (
                  <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                    Nenhum {modelo.equipamento.toLowerCase()} cadastrado ainda.
                    {!podeCadastrar && " Peça à liderança para cadastrar."}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {aparelhos.map((a) => (
                    <li key={a.id}>
                      {a.abertaId ? (
                        <Link
                          href={`/manutencao-preventiva/${a.abertaId}`}
                          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{a.titulo}</span>
                          <span className="text-xs font-bold text-amber-800">▶️ Continuar</span>
                        </Link>
                      ) : (
                        <form action={iniciarPreventiva}>
                          <input type="hidden" name="modelo_id" value={modelo.id} />
                          <input type="hidden" name="equipamento_id" value={a.id} />
                          <BotaoEnviar
                            textoEnviando="Abrindo..."
                            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-primary hover:bg-primary-soft/30"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{a.titulo}</span>
                            <SeloDoPrazo prazo={a.prazo} curto />
                          </BotaoEnviar>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

                {podeCadastrar && (
                  <details className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/30" open={modelo.aparelhos.length === 0}>
                    <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                      ＋ Aparelho fora da lista: cadastrar e começar
                    </summary>
                    <form action={cadastrarEIniciar} className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <input type="hidden" name="modelo_id" value={modelo.id} />
                      <input
                        name="codigo"
                        required
                        maxLength={30}
                        placeholder="Código (etiqueta)"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      <input
                        name="local"
                        maxLength={80}
                        placeholder="Local"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      <BotaoEnviar
                        textoEnviando="Cadastrando..."
                        className="col-span-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                      >
                        Cadastrar e fazer a preventiva
                      </BotaoEnviar>
                    </form>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
