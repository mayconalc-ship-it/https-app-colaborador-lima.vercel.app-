"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  DISPERSAO_ACEITA,
  ROTULO_TIPO_DE_DIA,
  formatarNumero,
  formatarPercento,
  type DiaDoVolume,
} from "@/lib/mao-de-obra";
import { salvarDias } from "./actions";

/**
 * O VOLUME DIA A DIA (V.4 e V.5 do DPO: simulador monitorado diariamente,
 * com a dispersão do volume).
 *
 * A MÉDIA NECESSÁRIA MUDA COM O DIA (25/09/2026, pedido do dono): o
 * sábado entrega o que foi cadastrado para sábado, o dia útil leva o
 * resto dividido pelos dias úteis, e o domingo fica na grade -- em outra
 * cor -- porque não opera. Tudo recalcula enquanto se digita: é olhando a
 * dispersão que se decide o dia seguinte.
 */
export function FormDias({
  competencia,
  dias,
  podeEditar,
  planoUtil,
  planoSabado,
}: {
  competencia: string;
  dias: DiaDoVolume[];
  podeEditar: boolean;
  planoUtil: number;
  planoSabado: number;
}) {
  const [valores, setValores] = useState<Record<number, string>>(() => {
    const base: Record<number, string> = {};
    for (const d of dias) base[d.dia] = d.realizado == null ? "" : String(d.realizado);
    return base;
  });

  const conta = useMemo(() => {
    const linhas = dias.map((d) => {
      const bruto = (valores[d.dia] ?? "").trim().replace(/\./g, "").replace(",", ".");
      const valor = bruto === "" ? null : Number(bruto);
      const valido = valor != null && Number.isFinite(valor);
      return {
        ...d,
        realizado: valido ? valor : null,
        dispersao: valido && d.plan > 0 ? (valor as number) / d.plan - 1 : null,
      };
    });
    const lancados = linhas.filter((l) => l.realizado != null);
    const planDoMes = linhas.reduce((s, l) => s + l.plan, 0);
    const planAteAgora = lancados.reduce((s, l) => s + l.plan, 0);
    const realizadoAteAgora = lancados.reduce((s, l) => s + (l.realizado ?? 0), 0);
    const ritmo = planAteAgora > 0 ? realizadoAteAgora / planAteAgora : 1;
    const projetado = lancados.length === 0 ? planDoMes : realizadoAteAgora + (planDoMes - planAteAgora) * ritmo;
    return {
      linhas,
      lancados: lancados.length,
      planDoMes,
      realizadoAteAgora,
      dispersao: planAteAgora > 0 ? realizadoAteAgora / planAteAgora - 1 : null,
      projetado,
      dispersaoProjetada: planDoMes > 0 && lancados.length > 0 ? projetado / planDoMes - 1 : null,
      falta: Math.max(0, planDoMes - realizadoAteAgora),
    };
  }, [valores, dias]);

  const corDaDispersao = (d: number | null) =>
    d == null ? "text-slate-300" : Math.abs(d) > DISPERSAO_ACEITA ? "text-red-600" : "text-emerald-600";

  // Cada tipo de dia com a sua faixa: o domingo precisa saltar aos olhos.
  const faixaDoTipo = {
    util: "bg-white",
    sabado: "bg-amber-50",
    domingo: "bg-slate-100 text-slate-400",
  } as const;

  return (
    <form action={salvarDias} className="space-y-3">
      <input type="hidden" name="competencia" value={competencia} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero titulo="Média do dia útil" valor={`${formatarNumero(planoUtil, 0)} HL`} />
        <Numero titulo="Média do sábado" valor={`${formatarNumero(planoSabado, 0)} HL`} />
        <Numero
          titulo={`Realizado (${conta.lancados} dia${conta.lancados === 1 ? "" : "s"})`}
          valor={`${formatarNumero(conta.realizadoAteAgora, 0)} HL`}
        />
        <Numero
          titulo="Dispersão acumulada"
          valor={formatarPercento(conta.dispersao)}
          classe={corDaDispersao(conta.dispersao)}
        />
      </div>

      {/* O RITMO: onde o mês termina se continuar assim. */}
      {conta.lancados > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">No ritmo de hoje</p>
          <p className="mt-1 text-slate-700">
            O mês fecha em <b className="font-mono tabular-nums">{formatarNumero(conta.projetado, 0)} HL</b> contra o
            plano de <b className="font-mono tabular-nums">{formatarNumero(conta.planDoMes, 0)} HL</b> (
            <b className={`font-mono tabular-nums ${corDaDispersao(conta.dispersaoProjetada)}`}>
              {formatarPercento(conta.dispersaoProjetada)}
            </b>
            ). Faltam <b className="font-mono tabular-nums">{formatarNumero(conta.falta, 0)} HL</b> para o plano.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Dia</th>
              <th className="w-24 px-1 py-2 text-right">Necessário</th>
              <th className="w-32 px-2 py-2 text-right">Realizado</th>
              <th className="w-16 px-2 py-2 text-right">Disp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {conta.linhas.map((l) => (
              <tr key={l.dia} className={faixaDoTipo[l.tipo]}>
                <td className="px-2 py-1">
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-700">{l.rotulo}</span>
                  <span className="ml-1 text-[11px] uppercase text-slate-400">{l.diaDaSemana}</span>
                </td>
                <td className="px-1 py-1 text-right font-mono text-xs tabular-nums text-slate-500">
                  {l.tipo === "domingo" ? "—" : formatarNumero(l.plan, 0)}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    name={`dia_${l.dia}`}
                    value={valores[l.dia] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [l.dia]: e.target.value }))}
                    disabled={!podeEditar}
                    inputMode="decimal"
                    placeholder={l.tipo === "domingo" ? "não opera" : ""}
                    aria-label={`Volume de ${l.rotulo}`}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-primary focus:outline-none disabled:bg-slate-50"
                  />
                </td>
                <td className={`px-2 py-1 text-right font-mono text-xs tabular-nums ${corDaDispersao(l.dispersao)}`}>
                  {l.dispersao == null ? "—" : formatarPercento(l.dispersao)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[3px] border-double border-slate-300 bg-slate-50 font-semibold">
              <td className="px-2 py-2 text-slate-700">Mês</td>
              <td className="px-1 py-2 text-right font-mono text-xs tabular-nums">
                {formatarNumero(conta.planDoMes, 0)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                {formatarNumero(conta.realizadoAteAgora, 0)}
              </td>
              <td className={`px-2 py-2 text-right font-mono text-xs tabular-nums ${corDaDispersao(conta.dispersao)}`}>
                {formatarPercento(conta.dispersao)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {(["util", "sabado", "domingo"] as const).map((t) => (
          <span key={t} className={`rounded px-2 py-0.5 font-medium ${faixaDoTipo[t]} ring-1 ring-slate-200`}>
            {ROTULO_TIPO_DE_DIA[t]}
          </span>
        ))}
        <span className="rounded px-2 py-0.5 font-medium text-slate-500">
          Faixa aceita: {formatarPercento(DISPERSAO_ACEITA)} para mais ou para menos
        </span>
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
        A média necessária vem do mês: sábado entrega o volume cadastrado para sábado, e o resto se divide pelos dias
        úteis. Dia em branco não entra no acumulado.
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
