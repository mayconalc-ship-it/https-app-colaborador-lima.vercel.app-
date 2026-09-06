"use client";

import { useState } from "react";
import type { AvisoNaRota } from "@/lib/pdv-particularidades-server";

/**
 * O TRIÂNGULO DA PRÉ-ROTA -- o que o motorista precisa saber antes de sair.
 *
 * Pedido do dono (06/09/2026): "daria um alerta com o triângulo de atenção
 * informando sobre a particularidade desse pdv".
 *
 * FICA ACIMA DA PRÉ-ROTA, e é a única coisa que fica. O cartão da rota é
 * consulta -- km, caixas, ocupação --; isto é instrução, e instrução que
 * aparece depois do que se veio ver é instrução que se lê no caminho de
 * volta.
 *
 * OS CRÍTICOS VÊM ABERTOS; o resto, recolhido. Numa rota com nove avisos,
 * abrir todos é a mesma coisa que não ter nenhum: o motorista rola até o
 * fim procurando o mapa e passa por cima de tudo. Fechado, ele lê a
 * contagem, e abre se quiser.
 *
 * A IMPRECISÃO É DITA, não escondida. Quando o casamento foi por região, o
 * bloco diz "nos bairros deste mapa" em vez de fingir que sabe quem está
 * na carga. Medido: adivinhar os clientes do dia pelo histórico do mapa
 * erraria 9 em cada 10 -- e o primeiro aviso errado ensina a ignorar todos
 * os seguintes.
 */
export function AvisosDaRota({
  avisos,
  precisao,
}: {
  avisos: AvisoNaRota[];
  precisao: "cliente" | "regiao";
}) {
  const criticos = avisos.filter((a) => a.severidade === "critico");
  const [aberto, setAberto] = useState(criticos.length > 0);

  if (avisos.length === 0) return null;

  const porRegiao = precisao === "regiao";

  return (
    <div
      className={`mb-3 overflow-hidden rounded-2xl border-2 shadow-sm ${
        criticos.length > 0 ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"
      }`}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-2xl leading-none" aria-hidden="true">
            ⚠️
          </span>
          <span className="min-w-0">
            <span
              className={`block text-sm font-bold ${
                criticos.length > 0 ? "text-red-900" : "text-amber-900"
              }`}
            >
              {avisos.length} aviso{avisos.length === 1 ? "" : "s"} de cliente
              {criticos.length > 0 && ` · ${criticos.length} crítico${criticos.length === 1 ? "" : "s"}`}
            </span>
            <span className="block text-xs text-slate-600">
              {porRegiao
                ? "Clientes com particularidade nos bairros deste mapa"
                : "Clientes desta carga"}
            </span>
          </span>
        </span>
        <span
          className={`shrink-0 text-xs font-semibold ${
            criticos.length > 0 ? "text-red-800" : "text-amber-800"
          } transition-transform ${aberto ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ▸
        </span>
      </button>

      {aberto && (
        <div className="space-y-2 border-t border-black/10 bg-white/70 p-3">
          {porRegiao && (
            <p className="rounded-lg bg-white px-3 py-2 text-xs leading-snug text-slate-600">
              A lista de clientes deste mapa ainda não vem do roteirizador, então o app cruza pelos{" "}
              <strong>bairros da rota</strong>. Pode ser que algum destes clientes não esteja na sua
              carga de hoje — e é por isso que ele aparece com a região do lado.
            </p>
          )}

          {avisos.map((a, i) => (
            <div
              key={`${a.codPdv}-${i}`}
              className={`rounded-xl border-l-4 bg-white p-3 shadow-sm ${
                a.severidade === "critico"
                  ? "border-l-red-500"
                  : a.severidade === "atencao"
                    ? "border-l-amber-500"
                    : "border-l-slate-300"
              }`}
            >
              <p className="text-sm font-bold text-slate-900">
                {a.emoji} {a.nomePdv ?? `Cliente ${a.codPdv}`}
                <span className="ml-1.5 text-xs font-normal text-slate-400">#{a.codPdv}</span>
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                {a.categoria}
                {(a.cidade || a.bairro) &&
                  ` · ${[a.cidade, a.bairro].filter(Boolean).join(" / ")}`}
              </p>

              <p className="mt-1.5 text-sm leading-snug text-slate-800">{a.aviso}</p>
              {a.detalhe && <p className="mt-1 text-xs text-slate-500">{a.detalhe}</p>}

              {(a.horario || a.dias || a.diasDePrazo !== null) && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
                  {a.horario && <span>⏰ {a.horario}</span>}
                  {a.dias && <span>📅 {a.dias}</span>}
                  {a.diasDePrazo !== null && (
                    <span className={a.diasDePrazo < 0 ? "font-bold text-red-700" : ""}>
                      🚫{" "}
                      {a.diasDePrazo < 0
                        ? "prazo vencido — confirme com a liderança"
                        : a.diasDePrazo === 0
                          ? "libera hoje"
                          : `libera em ${a.diasDePrazo} dia${a.diasDePrazo === 1 ? "" : "s"}`}
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}

          <p className="px-1 text-center text-[11px] text-slate-500">
            Algo diferente do que está aqui? Avise a liderança — é assim que a lista fica certa.
          </p>
        </div>
      )}
    </div>
  );
}
