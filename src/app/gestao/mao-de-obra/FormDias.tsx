"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { DISPERSAO_ACEITA, formatarNumero, formatarPercento } from "@/lib/mao-de-obra";
import { salvarDias } from "./actions";

/**
 * O VOLUME DIA A DIA (25/09/2026, item V.4 do DPO: "simulador monitorado
 * diariamente"). O plano do dia é o volume do mês dividido pelos dias
 * úteis; a pessoa lança o que saiu, e a dispersão aparece na hora -- antes
 * de salvar, porque é olhando a dispersão que se decide o dia seguinte.
 */
export function FormDias({
  competencia,
  plan,
  dias,
  realizado,
  podeEditar,
}: {
  competencia: string;
  plan: number;
  dias: number;
  realizado: Record<number, number>;
  podeEditar: boolean;
}) {
  const [valores, setValores] = useState<Record<number, string>>(() => {
    const base: Record<number, string> = {};
    for (let d = 1; d <= dias; d++) base[d] = realizado[d] == null ? "" : String(realizado[d]);
    return base;
  });

  const conta = useMemo(() => {
    const linhas = [];
    let planAcumulado = 0;
    let realizadoAcumulado = 0;
    for (let d = 1; d <= dias; d++) {
      const bruto = (valores[d] ?? "").trim().replace(/\./g, "").replace(",", ".");
      const valor = bruto === "" ? null : Number(bruto);
      if (valor != null && Number.isFinite(valor)) {
        planAcumulado += plan;
        realizadoAcumulado += valor;
      }
      linhas.push({ dia: d, valor, dispersao: valor == null || plan <= 0 ? null : valor / plan - 1 });
    }
    return {
      linhas,
      planAcumulado,
      realizadoAcumulado,
      lancados: linhas.filter((l) => l.valor != null).length,
      dispersao: planAcumulado > 0 ? realizadoAcumulado / planAcumulado - 1 : null,
    };
  }, [valores, plan, dias]);

  const cor = (d: number | null) =>
    d == null ? "text-slate-300" : Math.abs(d) > DISPERSAO_ACEITA ? "text-red-600" : "text-emerald-600";

  return (
    <form action={salvarDias} className="space-y-3">
      <input type="hidden" name="competencia" value={competencia} />

      <div className="grid grid-cols-3 gap-2">
        <Numero titulo="Plano do dia útil" valor={`${formatarNumero(plan, 0)} HL`} />
        <Numero titulo={`Acumulado (${conta.lancados} dias)`} valor={`${formatarNumero(conta.realizadoAcumulado, 0)} HL`} />
        <Numero
          titulo="Dispersão acumulada"
          valor={formatarPercento(conta.dispersao)}
          classe={cor(conta.dispersao)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-12 px-2 py-2">Dia</th>
              <th className="px-2 py-2 text-right">Plano</th>
              <th className="px-2 py-2 text-right">Realizado</th>
              <th className="w-20 px-2 py-2 text-right">Disp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {conta.linhas.map((l) => (
              <tr key={l.dia}>
                <td className="px-2 py-1 font-mono text-xs tabular-nums text-slate-500">{l.dia}</td>
                <td className="px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-400">
                  {formatarNumero(plan, 0)}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    name={`dia_${l.dia}`}
                    value={valores[l.dia] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [l.dia]: e.target.value }))}
                    disabled={!podeEditar}
                    inputMode="decimal"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-primary focus:outline-none disabled:bg-slate-50"
                  />
                </td>
                <td className={`px-2 py-1 text-right font-mono text-xs tabular-nums ${cor(l.dispersao)}`}>
                  {l.dispersao == null ? "—" : formatarPercento(l.dispersao)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeEditar && (
        <BotaoEnviar
          textoEnviando="Salvando..."
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Salvar o volume do dia
        </BotaoEnviar>
      )}
      <p className="text-[11px] text-slate-500">
        Dia em branco fica sem lançamento e não entra no acumulado. A faixa aceita é de{" "}
        {formatarPercento(DISPERSAO_ACEITA)} para mais ou para menos.
      </p>
    </form>
  );
}

function Numero({ titulo, valor, classe = "text-slate-900" }: { titulo: string; valor: string; classe?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{titulo}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${classe}`}>{valor}</p>
    </div>
  );
}
