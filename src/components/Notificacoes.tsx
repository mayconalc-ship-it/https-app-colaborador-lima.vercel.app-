"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EMOJI_MODULO,
  ROTULO_MODULO,
  tempoRelativo,
  type Aviso,
} from "@/lib/notificacoes";
import {
  carregarAvisos,
  marcarAviso,
  marcarTudoVisto,
} from "@/app/notificacoes/actions";

/**
 * Central de notificações: o sino no cabeçalho e o balão de aviso.
 *
 * Os dois compartilham a MESMA consulta, feita uma vez por carregamento de
 * página. Separar em dois componentes dobraria o custo sem ganho nenhum.
 *
 * O balão nunca bloqueia o app: é um cartão no rodapé, fácil de dispensar.
 * Só um por visita, mesmo com dez novidades — o resto espera no sino.
 */
export function Notificacoes() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [naoVistos, setNaoVistos] = useState(0);
  const [balao, setBalao] = useState<Aviso | null>(null);
  const [listaAberta, setListaAberta] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarAvisos()
      .then((p) => {
        if (!ativo) return;
        setAvisos(p.avisos);
        setNaoVistos(p.naoVistos);
        setBalao(p.balao);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  function fecharBalao(aviso: Aviso, comoDispensado: boolean) {
    setBalao(null);
    void marcarAviso(aviso.chave, comoDispensado ? "dispensada" : "vista");
    setAvisos((atuais) =>
      atuais.map((a) => (a.chave === aviso.chave ? { ...a, vista: true } : a)),
    );
    setNaoVistos((n) => Math.max(0, n - 1));
  }

  function aoClicar(aviso: Aviso) {
    void marcarAviso(aviso.chave, "clicada");
    setBalao(null);
    setListaAberta(false);
    setAvisos((atuais) =>
      atuais.map((a) => (a.chave === aviso.chave ? { ...a, vista: true } : a)),
    );
    setNaoVistos((n) => Math.max(0, n - 1));
  }

  function limparTudo() {
    const naoLidos = avisos.filter((a) => !a.vista).map((a) => a.chave);
    if (naoLidos.length === 0) return;
    void marcarTudoVisto(naoLidos);
    setAvisos((atuais) => atuais.map((a) => ({ ...a, vista: true })));
    setNaoVistos(0);
    setBalao(null);
  }

  return (
    <>
      {/* ---- Sino no cabeçalho ---- */}
      <button
        type="button"
        onClick={() => setListaAberta((v) => !v)}
        aria-label={
          naoVistos > 0
            ? `Notificações: ${naoVistos} não lida(s)`
            : "Notificações"
        }
        className="relative shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20"
      >
        🔔
        {naoVistos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-xs font-bold text-primary-dark">
            {naoVistos > 9 ? "9+" : naoVistos}
          </span>
        )}
      </button>

      {/* ---- Lista do sino ---- */}
      {listaAberta && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setListaAberta(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-2 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-4 sm:w-96">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800">Notificações</h2>
              {naoVistos > 0 && (
                <button
                  type="button"
                  onClick={limparTudo}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {avisos.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">
                Nenhuma novidade por aqui. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {avisos.map((a) => (
                  <li key={a.chave}>
                    <Link
                      href={a.url}
                      onClick={() => aoClicar(a)}
                      className={`flex gap-3 p-4 hover:bg-slate-50 ${
                        a.vista
                          ? ""
                          : "border-l-4 border-primary bg-primary-soft/50"
                      }`}
                    >
                      <span className="relative text-xl leading-none">
                        {EMOJI_MODULO[a.modulo]}
                        {!a.vista && (
                          <span
                            className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-gold ring-2 ring-white"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-sm ${
                              a.vista
                                ? "font-semibold text-slate-800"
                                : "font-bold text-slate-900"
                            }`}
                          >
                            {a.titulo}
                          </span>
                          {!a.vista && (
                            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Nova
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          {a.mensagem}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {ROTULO_MODULO[a.modulo]} ·{" "}
                          {tempoRelativo(a.criadoEm)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ---- Balão ---- */}
      {balao && !listaAberta && (
        <div className="fixed inset-x-3 bottom-3 z-40 sm:left-auto sm:right-4 sm:w-96">
          <div
            className={`rounded-2xl border bg-white p-4 shadow-2xl ${
              balao.tipo === "pendencia"
                ? "border-gold ring-2 ring-gold/40"
                : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">
                {EMOJI_MODULO[balao.modulo]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {balao.titulo}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {balao.mensagem}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fecharBalao(balao, true)}
                aria-label="Dispensar aviso"
                className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Link
                href={balao.url}
                onClick={() => aoClicar(balao)}
                className="flex-1 rounded-xl bg-primary py-3 text-center text-sm font-semibold text-white hover:bg-primary-dark"
              >
                {balao.rotuloBotao}
              </Link>
              <button
                type="button"
                onClick={() => fecharBalao(balao, true)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Agora não
              </button>
            </div>

            {naoVistos > 1 && (
              <button
                type="button"
                onClick={() => {
                  fecharBalao(balao, false);
                  setListaAberta(true);
                }}
                className="mt-2 w-full text-center text-xs text-slate-400 hover:text-primary"
              >
                Você tem mais {naoVistos - 1} novidade
                {naoVistos - 1 > 1 ? "s" : ""} — ver todas
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
