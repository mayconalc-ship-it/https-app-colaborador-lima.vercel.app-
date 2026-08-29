import Link from "next/link";
import { formatarData } from "@/lib/produtividade-armazem";
import type { DiaDoPeriodo } from "@/lib/rating";

/**
 * As cores dos gráficos, escolhidas e CONFERIDAS, não no olho.
 *
 * O azul é o do app (--primary). O par verde/âmbar da faixa de dias
 * passou nos testes de contraste e de visão normal, mas ficou em ΔE 7,9
 * para protanopia -- por isso a faixa nunca usa só a cor: o dia com nota
 * baixa leva anel, ponto e número, e a legenda está sempre à vista.
 *
 * Vermelho e âmbar juntos foram DESCARTADOS: ΔE 14,4 entre eles, difícil
 * de separar mesmo com visão normal. Onde os dois aparecem (cartão de
 * detrator x neutro) há rótulo escrito do lado.
 */
const AZUL = "#0b4da2";
const VERDE = "#059669";
const AMBAR = "#d97706";

// ====================================================================
// FAIXA DE DIAS
// ====================================================================

/**
 * Calendário do período: um quadrado por dia, em semanas.
 *
 * Mostra os dias VAZIOS de propósito. Medido nos dados reais: numa
 * janela de 30 dias a mediana é 4 dias com avaliação -- esconder o vazio
 * daria a impressão de que toda entrega é avaliada, e o motorista acharia
 * que sumiram avaliações dele.
 */
export function FaixaDeDias({
  dias,
  diaSelecionado,
  base,
}: {
  dias: DiaDoPeriodo[];
  diaSelecionado: string | null;
  base: (dia: string) => string;
}) {
  if (dias.length === 0) return null;

  // Alinha a primeira semana no dia da semana certo (domingo = 0).
  const primeiro = new Date(`${dias[0].dia}T00:00:00Z`).getUTCDay();
  const vazios = Array.from({ length: primeiro }, (_, i) => i);

  const comAvaliacao = dias.filter((d) => d.total > 0).length;
  const comProblema = dias.filter((d) => d.abaixoDaMeta > 0).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Seus dias no período</h2>
        <span className="text-xs text-slate-400">
          {comAvaliacao} de {dias.length} dias avaliados
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-semibold uppercase text-slate-300">
            {d}
          </span>
        ))}
        {vazios.map((i) => (
          <span key={`vazio-${i}`} />
        ))}
        {dias.map((d) => (
          <CelulaDoDia key={d.dia} dia={d} selecionado={d.dia === diaSelecionado} href={base(d.dia)} />
        ))}
      </div>

      {/* Legenda sempre presente: a cor nunca carrega o significado sozinha. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: VERDE }} />
          Todas 5 estrelas
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="flex h-3 w-3 items-center justify-center rounded ring-2 ring-offset-1"
            style={{ background: AMBAR, boxShadow: `0 0 0 1px ${AMBAR}` }}
          />
          Teve nota abaixo de 5
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-dashed border-slate-300 bg-slate-50" />
          Sem avaliação
        </span>
      </div>

      {comProblema > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          {comProblema === 1
            ? "1 dia com cliente insatisfeito — toque nele para ver."
            : `${comProblema} dias com cliente insatisfeito — toque neles para ver.`}
        </p>
      )}
    </section>
  );
}

function CelulaDoDia({
  dia,
  selecionado,
  href,
}: {
  dia: DiaDoPeriodo;
  selecionado: boolean;
  href: string;
}) {
  const numero = dia.dia.slice(8);
  const vazio = dia.total === 0;
  const problema = dia.abaixoDaMeta > 0;

  const titulo = vazio
    ? `${formatarData(dia.dia)} — nenhuma entrega sua foi avaliada`
    : `${formatarData(dia.dia)} — ${dia.total} avaliação(ões), média ${dia.media}` +
      (problema ? `, ${dia.abaixoDaMeta} abaixo de 5` : ", todas 5 estrelas");

  const fundo = vazio ? undefined : problema ? AMBAR : VERDE;

  return (
    <Link
      href={href}
      title={titulo}
      aria-label={titulo}
      className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] font-bold transition-transform hover:scale-110 ${
        vazio
          ? "border border-dashed border-slate-200 bg-slate-50 text-slate-300"
          : "text-white"
      } ${selecionado ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
      style={fundo ? { background: fundo } : undefined}
    >
      {numero}
      {/* Codificação secundária: quem não separa verde de âmbar enxerga o
          ponto e a contagem. */}
      {problema && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-black text-amber-700 shadow">
          {dia.abaixoDaMeta}
        </span>
      )}
      {!vazio && !problema && <span className="text-[8px] font-normal opacity-80">{dia.total}</span>}
    </Link>
  );
}

// ====================================================================
// BARRAS
// ====================================================================

/**
 * Barra horizontal simples, uma série só -- por isso sem legenda: o
 * título já diz o que está sendo contado. O número fica na ponta, não
 * dentro, para caber em nome comprido de cidade.
 */
export function BarrasHorizontais({
  titulo,
  subtitulo,
  itens,
  vazio = "Nada no período.",
  maximoDeItens = 8,
}: {
  titulo: string;
  subtitulo?: string;
  itens: { chave: string; total: number }[];
  vazio?: string;
  maximoDeItens?: number;
}) {
  const lista = itens.slice(0, maximoDeItens);
  const maior = lista.length ? lista[0].total : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-[11px] text-slate-400">{subtitulo}</p>}

      {lista.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {lista.map((i) => (
            <li key={i.chave}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-slate-700">{i.chave}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{i.total}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maior > 0 ? Math.max((i.total / maior) * 100, 3) : 0}%`,
                    background: AZUL,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {itens.length > maximoDeItens && (
        <p className="mt-2 text-[11px] text-slate-400">
          e mais {itens.length - maximoDeItens} — mostrando os {maximoDeItens} maiores
        </p>
      )}
    </section>
  );
}

/**
 * Distribuição das notas de 1 a 5. Ordinal, não categórico: por isso uma
 * cor só, com a barra de 5 estrelas em verde para separar a meta do
 * resto -- e o rótulo escrito do lado, nunca só a cor.
 */
export function DistribuicaoDeNotas({ contagem }: { contagem: Record<number, number> }) {
  const total = Object.values(contagem).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const maior = Math.max(...Object.values(contagem));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">Distribuição das notas</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Quantas entregas suas receberam cada nota no período
      </p>

      <ul className="mt-3 space-y-2">
        {[5, 4, 3, 2, 1].map((n) => {
          const v = contagem[n] ?? 0;
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <li key={n} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">
                {n} <span className="text-amber-400">★</span>
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maior > 0 ? (v / maior) * 100 : 0}%`,
                    background: n === 5 ? VERDE : AZUL,
                  }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-600">
                {v} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
