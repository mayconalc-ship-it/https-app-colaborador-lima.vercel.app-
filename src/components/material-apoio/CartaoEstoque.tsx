import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  FAIXAS,
  formatarDias,
  formatarLinear,
  formatarQuantidade,
  type Faixa,
} from "@/lib/material-apoio";
import type { ItemDoEstoque } from "@/lib/material-apoio-server";

const COR_DO_TOM: Record<(typeof FAIXAS)[Faixa]["tom"], string> = {
  critico: "bg-red-100 text-red-800",
  alerta: "bg-amber-100 text-amber-800",
  atencao: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200",
  ok: "bg-green-100 text-green-800",
  excesso: "bg-sky-100 text-sky-800",
  neutro: "bg-slate-100 text-slate-600",
};

const BORDA_DO_TOM: Record<(typeof FAIXAS)[Faixa]["tom"], string> = {
  critico: "border-red-300",
  alerta: "border-amber-300",
  atencao: "border-yellow-200",
  ok: "border-slate-200",
  excesso: "border-sky-200",
  neutro: "border-slate-200",
};

export function SeloFaixa({ faixa }: { faixa: Faixa }) {
  const f = FAIXAS[faixa];
  return <span className={`rounded-lg px-2 py-1 text-xs font-bold ${COR_DO_TOM[f.tom]}`}>{f.rotulo}</span>;
}

/**
 * A régua das políticas: de zero até um pouco além da máxima, com as três
 * marcas e o ponto de hoje. Lê-se de relance "quanto falta para a mínima"
 * sem fazer conta.
 */
function ReguaDasPoliticas({ item }: { item: ItemDoEstoque }) {
  const { produto: p, situacao: s } = item;
  const fim = Math.max(p.politica_maxima_dias * 1.2, (s.dias ?? 0) * 1.05, 1);
  const pct = (d: number) => `${Math.min(100, (d / fim) * 100)}%`;

  return (
    <div className="mt-3">
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 bg-red-200" style={{ width: pct(p.politica_minima_dias) }} />
        <div
          className="absolute inset-y-0 bg-amber-100"
          style={{ left: pct(p.politica_minima_dias), width: `calc(${pct(p.politica_objetivo_dias)} - ${pct(p.politica_minima_dias)})` }}
        />
        <div
          className="absolute inset-y-0 bg-green-200"
          style={{ left: pct(p.politica_objetivo_dias), width: `calc(${pct(p.politica_maxima_dias)} - ${pct(p.politica_objetivo_dias)})` }}
        />
        {s.dias != null && (
          <div
            className="absolute -top-0.5 h-4 w-1 -translate-x-1/2 rounded-full bg-slate-900"
            style={{ left: pct(s.dias) }}
            aria-label={`Hoje: ${formatarDias(s.dias)} dias`}
          />
        )}
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-slate-500">
        Mínima {p.politica_minima_dias} · Objetiva {p.politica_objetivo_dias} · Máxima {p.politica_maxima_dias} dias
      </p>
    </div>
  );
}

export function CartaoEstoque({ item }: { item: ItemDoEstoque }) {
  const { produto: p, ultima, situacao: s } = item;
  const tom = FAIXAS[s.faixa].tom;
  const precisaComprar = s.faixa === "abaixo-minima" || s.faixa === "perto-minima" || s.faixa === "abaixo-objetivo";

  return (
    <li className={`rounded-2xl border bg-white p-4 shadow-sm ${BORDA_DO_TOM[tom]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-bold text-slate-900">
            {p.nome}
            {!p.ativo && <span className="ml-2 text-xs font-medium text-slate-400">(desativado)</span>}
          </p>
          <p className="text-xs text-slate-500">Linear: {formatarLinear(p)}</p>
        </div>
        <SeloFaixa faixa={s.faixa} />
      </div>

      {s.dias == null ? (
        <p className="mt-3 text-sm text-slate-500">Ainda sem contagem — conte para ver os dias de estoque.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {formatarDias(s.dias)} <span className="text-sm font-semibold text-slate-500">dias de estoque</span>
            </p>
            <p className="text-sm tabular-nums text-slate-600">≈ {formatarQuantidade(s.estoque ?? 0, p.unidade)} hoje</p>
          </div>
          <ReguaDasPoliticas item={item} />
          {precisaComprar && (
            <p className={`mt-3 rounded-xl p-3 text-sm ${tom === "critico" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
              🛒 Solicitar compra: <b>~{formatarQuantidade(s.comprarParaObjetivo ?? 0, p.unidade)}</b> para a política objetiva
              ({p.politica_objetivo_dias} dias) · até ~{formatarQuantidade(s.comprarAteMaxima ?? 0, p.unidade)} para a máxima.
            </p>
          )}
          {ultima && (
            <p className="mt-2 text-[11px] text-slate-400">
              Contado em {formatarDataHora(ultima.contado_em)} por {ultima.colaborador_nome}
              {s.diasDesdeContagem
                ? ` · ${formatarQuantidade(ultima.quantidade, p.unidade)} na contagem, menos ${s.diasDesdeContagem} dia${s.diasDesdeContagem === 1 ? "" : "s"} de uso`
                : ""}
            </p>
          )}
        </>
      )}
    </li>
  );
}
