"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  LIMITE_DIFERENCA_PCT,
  LIMITE_JUSTIFICATIVA,
  campoJustificativa,
  chave,
  type LinhaConciliacao,
} from "@/lib/ativo-giro";
import { salvarJustificativas } from "./actions";

/**
 * A TABELA DA CONCILIAÇÃO, com a justificativa de cada linha.
 *
 * JUSTIFICATIVA LINHA POR LINHA (16/09/2026, pedido do dono): opcional,
 * logo abaixo do item que ela explica -- "faltaram 40 caixas de 600ml
 * porque a carreta chegou depois da contagem" fica colado nos números a
 * que se refere, e não num campo solto no fim da tela.
 *
 * Um Salvar só, no fim, para todas as linhas. Enquanto houver justificativa
 * digitada e não salva, o bloco de congelar (que vem em `congelar`) fica
 * travado: congelar grava o que está no BANCO, e o texto da tela se
 * perderia sem ninguém perceber.
 *
 * Quem não pode justificar (a mesma liberação de congelar) e o dia já
 * congelado mostram a justificativa só para leitura.
 */
export function TabelaConciliacao({
  linhas,
  justificativas,
  podeJustificar,
  data,
  colab,
  congelar,
}: {
  linhas: LinhaConciliacao[];
  /** tipo|formato -> texto salvo (ou congelado). */
  justificativas: Record<string, string>;
  /** Pode editar agora: tem a liberação, a pessoa está escolhida e o dia não está congelado. */
  podeJustificar: boolean;
  data: string;
  colab: string;
  congelar?: React.ReactNode;
}) {
  const [textos, setTextos] = useState<Record<string, string>>(justificativas);
  const alteradas = linhas.filter((l) => {
    const k = chave(l.tipo, l.formato);
    return (textos[k] ?? "").trim() !== (justificativas[k] ?? "").trim();
  }).length;

  const tabela = (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="p-2">Tipo</th>
            <th className="p-2">Formato</th>
            <th className="p-2 text-right">Contado</th>
            {/* As três parcelas separadas: é o que diz ONDE está o ativo
                que não foi contado. Com um número só, sabia-se apenas que
                ele não estava aqui. */}
            <th className="p-2 text-right" title="Saiu com a entrega e volta no mesmo dia. Lançado por quem tem liberação.">
              Rota
            </th>
            <th className="p-2 text-right" title="Está entre unidades, com o transportador. Lançado por quem tem liberação.">
              Carreta
            </th>
            <th className="p-2 text-right" title="Emprestado ao cliente. Vale até alguém mudar -- não se lança todo dia.">
              Comodato
            </th>
            <th className="p-2 text-right">Parque</th>
            <th className="p-2 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const k = chave(l.tipo, l.formato);
            const texto = textos[k] ?? "";
            const salvo = justificativas[k] ?? "";
            const fora = l.diferenca !== 0 && !l.dentroDoAceitavel;
            return (
              <FragmentoLinha key={k}>
                <tr className="border-t border-slate-100">
                  <td className="p-2">{l.tipo}</td>
                  <td className="p-2">{l.formato}</td>
                  <td className="p-2 text-right tabular-nums">{l.contado}</td>
                  {/* Só leitura para quem conta: os números aparecem do lado
                      do contado para explicar a diferença, mas quem edita é
                      quem tem liberação, nos blocos abaixo. */}
                  <td className="p-2 text-right tabular-nums text-slate-500">{l.rota > 0 ? l.rota : "—"}</td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{l.carreta > 0 ? l.carreta : "—"}</td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{l.comodato > 0 ? l.comodato : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{l.parque}</td>
                  <td
                    className={`p-2 text-right font-bold tabular-nums ${
                      l.diferenca === 0 ? "text-slate-500" : l.dentroDoAceitavel ? "text-slate-700" : "text-red-600"
                    }`}
                  >
                    {l.diferenca > 0 ? "+" : ""}
                    {l.diferenca}
                    {/* O percentual vem junto do número: é ele que diz se a
                        diferença é grande, e 40 caixas significam coisas
                        opostas num parque de 400 e num de 18 mil. */}
                    {l.pctDiferenca !== null && l.diferenca !== 0 && (
                      <span className="ml-1 text-[11px] font-medium text-slate-400">
                        {l.pctDiferenca.toLocaleString("pt-BR")}%
                      </span>
                    )}
                  </td>
                </tr>
                {(podeJustificar || salvo) && (
                  <tr>
                    <td colSpan={8} className="px-2 pb-2">
                      {/* Presa à esquerda da área visível: no celular a
                          tabela rola para o lado, e o campo não pode rolar
                          para fora junto com as colunas de número. */}
                      <div className="sticky left-2 w-[min(100%,calc(100vw-4.5rem))]">
                        {podeJustificar ? (
                          // Caixa que cresce com o texto (até 4 linhas): num
                          // campo de uma linha a justificativa comprida
                          // ficava cortada e não dava para reler o que se
                          // escreveu -- justamente no celular.
                          <textarea
                            name={campoJustificativa(l.tipo, l.formato)}
                            value={texto}
                            onChange={(e) => setTextos((t) => ({ ...t, [k]: e.target.value }))}
                            maxLength={LIMITE_JUSTIFICATIVA}
                            rows={Math.min(4, Math.max(1, Math.ceil(texto.length / 40)))}
                            placeholder={fora ? "Justificativa da diferença (opcional)" : "Justificativa (opcional)"}
                            aria-label={`Justificativa de ${l.tipo} ${l.formato}`}
                            className={`block w-full resize-none rounded-lg border bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none ${
                              fora && !texto.trim() ? "border-red-200" : "border-slate-200"
                            }`}
                          />
                        ) : (
                          <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                            <span className="text-xs font-semibold uppercase text-slate-500">Justificativa: </span>
                            {salvo}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </FragmentoLinha>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {podeJustificar ? (
        <form action={salvarJustificativas} className="space-y-2">
          <input type="hidden" name="data" value={data} />
          <input type="hidden" name="colab" value={colab} />
          {tabela}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Em vermelho, a linha cuja diferença passa de {LIMITE_DIFERENCA_PCT}% do parque daquele item.
            </p>
            <BotaoEnviar
              disabled={alteradas === 0}
              textoEnviando="Salvando..."
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
            >
              {alteradas > 0
                ? `Salvar justificativas (${alteradas} alterada${alteradas === 1 ? "" : "s"})`
                : "Justificativas salvas"}
            </BotaoEnviar>
          </div>
        </form>
      ) : (
        <>
          {tabela}
          {/* A cor sozinha não serve para quem não a enxerga -- a legenda
              diz a regra por escrito. */}
          <p className="mt-2 text-xs text-slate-500">
            Em vermelho, a linha cuja diferença passa de {LIMITE_DIFERENCA_PCT}% do parque daquele item.
          </p>
        </>
      )}

      {congelar && (
        <div className="relative">
          {alteradas > 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Salve as justificativas antes de congelar — o congelamento grava o que está salvo.
            </p>
          )}
          <div className={alteradas > 0 ? "pointer-events-none select-none opacity-40" : ""} aria-disabled={alteradas > 0}>
            {congelar}
          </div>
        </div>
      )}
    </>
  );
}

/** Duas linhas da tabela por item (números + justificativa), sem elemento extra no meio do tbody. */
function FragmentoLinha({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
