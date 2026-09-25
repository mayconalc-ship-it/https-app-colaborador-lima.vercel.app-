"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  DISPERSAO_ACEITA,
  ROTULO_TIPO_DE_DIA,
  formatarNumero,
  formatarPercento,
  leDoMes,
  lerNumeroDigitado,
  mostrarNumero,
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
  planoSabado,
  conferencia,
  diasInformados,
  curva,
}: {
  competencia: string;
  dias: DiaDoVolume[];
  podeEditar: boolean;
  planoSabado: number;
  /** A soma dos dias contra o volume negociado do mês. */
  conferencia: {
    planoDoMes: number;
    volumeBase: number;
    base: "negociado" | "ppr";
    diferenca: number;
    fecha: boolean;
    uteisQueOperam: number;
    sabadosQueOperam: number;
    diasParados: number;
  };
  /** Quantos dias de operação o mês informou -- para conferir com a grade. */
  diasInformados: number;
  /** A curva de sellout, quando ligada -- só para explicar a meta na tela. */
  curva: { rotulo: string; valor: number }[] | null;
}) {
  const [valores, setValores] = useState<Record<number, string>>(() => {
    const base: Record<number, string> = {};
    for (const d of dias) base[d.dia] = mostrarNumero(d.realizado, 2);
    return base;
  });
  // Quais dias operam: domingo nasce desligado, feriado se desliga aqui.
  const [opera, setOpera] = useState<Record<number, boolean>>(() => {
    const base: Record<number, boolean> = {};
    for (const d of dias) base[d.dia] = d.opera;
    return base;
  });

  const conta = useMemo(() => {
    // A META SE REDISTRIBUI NA HORA: desmarcar um feriado sobe a meta dos
    // outros dias, e a soma continua sendo o volume do mês.
    const operando = dias.filter((d) => opera[d.dia]);
    const sabadosOperando = operando.filter((d) => d.tipo === "sabado").length;
    const uteisOperando = operando.length - sabadosOperando;
    const doSabado = planoSabado;
    const metaUtil = uteisOperando > 0 ? (conferencia.volumeBase - doSabado * sabadosOperando) / uteisOperando : 0;
    // Com a curva ligada, o peso de cada dia já veio pronto do servidor:
    // aqui só se redistribui entre os dias que continuam marcados.
    const pesoTotal = operando.reduce((s, d) => s + (d.plan || 0), 0);

    const linhas = dias.map((d) => {
      const valor = lerNumeroDigitado(valores[d.dia]);
      const valido = valor != null && Number.isFinite(valor);
      const plan = !opera[d.dia]
        ? 0
        : curva && pesoTotal > 0
          ? (conferencia.volumeBase * (d.plan || 0)) / pesoTotal
          : d.tipo === "sabado"
            ? doSabado
            : metaUtil;
      return {
        ...d,
        plan,
        opera: opera[d.dia],
        realizado: valido ? valor : null,
        dispersao: valido && plan > 0 ? (valor as number) / plan - 1 : null,
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
      metaUtil,
      diasQueOperam: operando.length,
      lancados: lancados.length,
      le: leDoMes(
        linhas.map((l) => ({ ...l, opera: opera[l.dia] ?? false })),
        planDoMes,
      ),
      planDoMes,
      realizadoAteAgora,
      dispersao: planAteAgora > 0 ? realizadoAteAgora / planAteAgora - 1 : null,
      projetado,
      dispersaoProjetada: planDoMes > 0 && lancados.length > 0 ? projetado / planDoMes - 1 : null,
      falta: Math.max(0, planDoMes - realizadoAteAgora),
    };
  }, [valores, dias, opera, planoSabado, conferencia.volumeBase, curva]);

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

      {/* A META DO DIA VEM DO MÊS: se a soma não bate com o negociado, é
          o mês que precisa de ajuste -- e a tela diz qual campo. */}
      <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
        ✅ A meta dos dias soma <b>{formatarNumero(conferencia.volumeBase, 0)} HL</b> — o volume do mês, dividido
        pelos <b>{conta.diasQueOperam}</b> dias marcados como operação.
      </p>
      {diasInformados > 0 && diasInformados !== conta.diasQueOperam && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ No mês você informou <b>{diasInformados}</b> dias de operação (dias úteis + sábados), e a grade está com{" "}
          <b>{conta.diasQueOperam}</b> marcados. Desmarque os feriados e paradas na coluna “Opera” — a meta dos
          outros dias sobe sozinha e o total continua o mesmo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero
          titulo={curva ? "Meta média do dia útil" : "Média do dia útil"}
          valor={`${formatarNumero(
            curva
              ? conta.linhas.filter((l) => l.opera && l.tipo !== "sabado").reduce((s, l, _, a) => s + l.plan / a.length, 0)
              : conta.metaUtil,
            0,
          )} HL`}
        />
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

      {/* O LE: a previsão de fechamento, no ritmo dos dias lançados. */}
      {conta.lancados > 0 && (
        <div
          className={`rounded-xl p-3 text-sm ${
            conta.le.bate ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide">LE — previsão do mês</p>
            <p className="font-mono text-lg font-bold tabular-nums">
              {formatarNumero(conta.le.le, 0)} HL{" "}
              <span className="text-xs font-normal">
                ({conta.le.desvio != null && conta.le.desvio >= 0 ? "+" : ""}
                {formatarPercento(conta.le.desvio)} da meta)
              </span>
            </p>
          </div>
          <p className="mt-1">
            {conta.le.bate ? "✅ No ritmo de hoje, o mês bate a meta de " : "⚠️ No ritmo de hoje, o mês NÃO bate a meta de "}
            <b className="font-mono tabular-nums">{formatarNumero(conta.planDoMes, 0)} HL</b>.{" "}
            {conta.le.precisaPorDia != null && conta.le.diasQueFaltam > 0 && (
              <>
                Para chegar lá, faltam{" "}
                <b className="font-mono tabular-nums">{formatarNumero(conta.le.precisaPorDia, 0)} HL</b> por dia nos{" "}
                {conta.le.diasQueFaltam} dias que restam (a meta deles é{" "}
                <b className="font-mono tabular-nums">
                  {formatarNumero(conta.le.metaQueFalta / Math.max(1, conta.le.diasQueFaltam), 0)} HL
                </b>
                ).
              </>
            )}
          </p>
          <p className="mt-1 text-xs">
            Realizado <b className="font-mono tabular-nums">{formatarNumero(conta.le.realizado, 0)} HL</b> em{" "}
            {conta.le.diasLancados} dia{conta.le.diasLancados === 1 ? "" : "s"} · ritmo de{" "}
            <b className="font-mono tabular-nums">{formatarPercento((conta.le.ritmo ?? 1) - 1)}</b> contra a meta do
            período.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Dia</th>
              <th className="w-14 px-1 py-2 text-center">Opera</th>
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
                <td className="px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    name={`opera_${l.dia}`}
                    checked={opera[l.dia] ?? false}
                    disabled={!podeEditar}
                    onChange={(e) => setOpera((v) => ({ ...v, [l.dia]: e.target.checked }))}
                    aria-label={`${l.rotulo} opera`}
                    className="h-4 w-4 accent-primary"
                  />
                </td>
                <td className="px-1 py-1 text-right font-mono text-xs tabular-nums text-slate-500">
                  {l.opera ? formatarNumero(l.plan, 0) : "—"}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    name={`dia_${l.dia}`}
                    value={valores[l.dia] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [l.dia]: e.target.value }))}
                    disabled={!podeEditar}
                    inputMode="decimal"
                    placeholder={l.opera ? "" : "não opera"}
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
              <td className="px-1 py-2 text-center font-mono text-xs tabular-nums text-slate-500">
                {conta.diasQueOperam}
              </td>
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
        {curva
          ? `A meta de cada dia segue a curva de sellout (${curva
              .filter((c) => c.valor > 0)
              .map((c) => `${c.rotulo} ${formatarNumero(c.valor, 1)}%`)
              .join(" · ")}), redistribuída entre os dias marcados.`
          : "O sábado entrega o volume cadastrado para sábado; o resto se divide pelos dias úteis marcados."}{" "}
        Dia em branco não entra no acumulado, e dia desmarcado não recebe meta.
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
