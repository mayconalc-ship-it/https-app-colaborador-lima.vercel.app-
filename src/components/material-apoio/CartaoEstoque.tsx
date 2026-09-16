import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  FAIXAS,
  JANELA_DA_MEDIA_DIAS,
  MINIMO_DIAS_DA_MEDIA,
  consumoDiario,
  formatarAproximado,
  formatarCompra,
  formatarDias,
  formatarQuantidade,
  formatarReais,
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
  // shrink-0 + nowrap: o selo nunca espreme o nome do produto ao lado, e
  // nunca quebra em duas linhas.
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold ${COR_DO_TOM[f.tom]}`}>
      {f.rotulo}
    </span>
  );
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

/** O consumo que as contas usam, de onde ele vem, e o custo que ele dá. */
function ConsumoECusto({ item }: { item: ItemDoEstoque }) {
  const { produto: p, situacao: s, media } = item;
  const linear = consumoDiario(p.linear_quantidade, p.linear_periodo);
  const real = s.fonteDoConsumo === "real";

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {real ? "Consumo real" : "Consumo (linear cadastrada)"}
        </p>
        <p className="font-semibold tabular-nums text-slate-900">{formatarAproximado(s.consumo, p.unidade)} por dia</p>
        <p className="text-xs text-slate-500">
          {real
            ? `Média das contagens de ${media.dias} dias · linear cadastrada: ${formatarAproximado(linear, p.unidade)}/dia`
            : media.dias > 0
              ? `A média real sai com ${MINIMO_DIAS_DA_MEDIA} dias de contagens (hoje: ${media.dias})`
              : `A média real sai depois de contagens em ${MINIMO_DIAS_DA_MEDIA} dias ou mais`}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Custo</p>
        {s.custoDiario != null ? (
          <>
            <p className="font-semibold tabular-nums text-slate-900">
              {formatarReais(s.custoDiario)}/dia · {formatarReais(s.custoMensal ?? 0)}/mês
            </p>
            <p className="text-xs text-slate-500">
              {formatarReais(p.valor_unitario ?? 0)} por {p.unidade}
              {s.valorDoEstoque != null ? ` · estoque de hoje ≈ ${formatarReais(s.valorDoEstoque)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">Sem valor cadastrado — informe no cadastro do produto.</p>
        )}
      </div>
      {media.ignorados > 0 && (
        <p className="text-xs text-amber-800 sm:col-span-2">
          ⚠️ {media.ignorados} {media.ignorados === 1 ? "contagem subiu" : "contagens subiram"} sem entrada informada e{" "}
          {media.ignorados === 1 ? "ficou" : "ficaram"} fora da média (últimos {JANELA_DA_MEDIA_DIAS} dias). Ao contar, informe
          quanto entrou.
        </p>
      )}
    </div>
  );
}

export function CartaoEstoque({ item }: { item: ItemDoEstoque }) {
  const { produto: p, ultima, situacao: s } = item;
  const tom = FAIXAS[s.faixa].tom;
  const precisaComprar = s.faixa === "abaixo-minima" || s.faixa === "perto-minima" || s.faixa === "abaixo-objetivo";

  return (
    <li className={`rounded-2xl border bg-white p-4 shadow-sm ${BORDA_DO_TOM[tom]}`}>
      {/* O nome ganha a largura que sobra (flex-1) e, se o selo não couber
          ao lado, o selo desce para a linha de baixo (flex-wrap) -- em vez
          de os dois se espremerem. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 basis-44 break-words text-base font-bold leading-snug text-slate-900">
          {p.nome}
          {!p.ativo && <span className="ml-2 text-xs font-medium text-slate-400">(desativado)</span>}
        </p>
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
            <p className="text-sm tabular-nums text-slate-600">≈ {formatarAproximado(s.estoque ?? 0, p.unidade)} hoje</p>
          </div>
          <ReguaDasPoliticas item={item} />
          {precisaComprar && (
            <p className={`mt-3 rounded-xl p-3 text-sm ${tom === "critico" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
              🛒 Solicitar compra: <b>~{formatarCompra(s.comprarParaObjetivo ?? 0, p.unidade)}</b>
              {s.valorDaCompraObjetivo != null && s.valorDaCompraObjetivo > 0 && (
                <b> (≈ {formatarReais(s.valorDaCompraObjetivo)})</b>
              )}{" "}
              para a política objetiva ({p.politica_objetivo_dias} dias) · até ~
              {formatarCompra(s.comprarAteMaxima ?? 0, p.unidade)} para a máxima.
            </p>
          )}
        </>
      )}

      <ConsumoECusto item={item} />

      {ultima && (
        <p className="mt-2 text-[11px] text-slate-400">
          Última contagem: {formatarQuantidade(ultima.quantidade, p.unidade)} em {formatarDataHora(ultima.contado_em)} por{" "}
          {ultima.colaborador_nome}
          {s.diasDesdeContagem ? ` · a estimativa de hoje desconta ${s.diasDesdeContagem} dia${s.diasDesdeContagem === 1 ? "" : "s"} de consumo` : ""}
        </p>
      )}
    </li>
  );
}
