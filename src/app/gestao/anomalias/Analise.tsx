import { BarraRanking } from "../armazem/Graficos";
import type { Analise as DadosDaAnalise, Tom } from "@/lib/anomalias-analise";

const TERMOMETRO: Record<Tom, { caixa: string; icone: string; titulo: string }> = {
  ruim: { caixa: "border-red-200 bg-red-50", icone: "🔴", titulo: "text-red-800" },
  atencao: { caixa: "border-amber-200 bg-amber-50", icone: "🟡", titulo: "text-amber-900" },
  bom: { caixa: "border-emerald-200 bg-emerald-50", icone: "🟢", titulo: "text-emerald-800" },
};

const fmt = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });

/**
 * A ANÁLISE QUE ABRE COM O PAINEL (03/10/2026) -- ver lib/anomalias-analise.
 *
 * Tudo em leitura de um olhar: uma frase colorida no topo, três números
 * grandes e quatro gráficos de barra de um hue só (o mesmo padrão do
 * painel do Armazém, para quem já aprendeu a ler um ler o outro). Sem
 * biblioteca de gráfico e sem JavaScript no cliente: o `title` de cada
 * barra é a dica ao passar o dedo/mouse.
 */
export function AnaliseDasAnomalias({ a }: { a: DadosDaAnalise }) {
  const t = TERMOMETRO[a.termometro.tom];
  const diferenca = a.ultimos30 - a.anteriores30;
  const maiorSemana = Math.max(1, ...a.semanas.map((s) => s.total));

  return (
    <div className="space-y-4">
      {/* ---- 1. Como estamos: a frase ---- */}
      <section className={`rounded-2xl border-2 p-4 ${t.caixa}`} aria-label="Situação">
        <p className={`text-base font-bold ${t.titulo}`}>
          <span aria-hidden>{t.icone}</span> {a.termometro.titulo}
        </p>
        <p className="mt-0.5 text-sm text-slate-700">{a.termometro.detalhe}</p>
      </section>

      {/* ---- 2. Três números ---- */}
      <section className="grid gap-2 sm:grid-cols-3">
        <Numero
          valor={fmt(a.ultimos30)}
          rotulo="anomalias nos últimos 30 dias"
          rodape={
            diferenca === 0
              ? `igual aos 30 dias anteriores (${a.anteriores30})`
              : `${diferenca > 0 ? "▲" : "▼"} ${Math.abs(diferenca)} ${diferenca > 0 ? "a mais" : "a menos"} que os 30 dias anteriores (${a.anteriores30})`
          }
          tomRodape={diferenca > 0 ? "ruim" : diferenca < 0 ? "bom" : null}
        />
        <Numero
          valor={a.diasAteAssinar === null ? "—" : fmt(a.diasAteAssinar, 1)}
          rotulo="dias, em média, do disparo à assinatura"
          rodape={
            a.diasAteAssinar === null
              ? "nenhum relato assinado nos últimos 90 dias"
              : `${a.assinadosNaConta} relato${a.assinadosNaConta === 1 ? "" : "s"} assinado${a.assinadosNaConta === 1 ? "" : "s"} em 90 dias`
          }
        />
        <Numero
          valor={a.pctAcoesNoPrazo === null ? "—" : `${a.pctAcoesNoPrazo}%`}
          rotulo="das ações em aberto estão no prazo"
          rodape={a.acoesAbertas ? `${a.acoesAbertas} ${a.acoesAbertas === 1 ? "ação aberta" : "ações abertas"}` : "nenhuma ação aberta"}
          tomRodape={a.pctAcoesNoPrazo !== null && a.pctAcoesNoPrazo < 100 ? "ruim" : null}
        />
      </section>

      {/* ---- 3. A tendência: as últimas 8 semanas ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Anomalias por semana</h3>
        <p className="mt-0.5 text-xs text-slate-500">Relatos abertos em cada semana (seg a dom). A última barra é a semana atual.</p>
        <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-3" role="img" aria-label={`Anomalias por semana: ${a.semanas.map((s) => `${s.rotulo} ${s.total}`).join(", ")}`}>
          {a.semanas.map((s, i) => {
            const atual = i === a.semanas.length - 1;
            return (
              <div key={s.inicio} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`Semana de ${s.rotulo}: ${s.total} anomalia${s.total === 1 ? "" : "s"}`}>
                <span className="mb-1 text-xs font-bold tabular-nums text-slate-700">{s.total || ""}</span>
                <div
                  className={`w-full max-w-10 rounded-t ${atual ? "bg-primary/45" : "bg-primary"}`}
                  style={{ height: s.total ? `${Math.max(6, (s.total / maiorSemana) * 100)}%` : "2px" }}
                />
                <span className={`mt-1.5 text-[10px] tabular-nums ${atual ? "font-bold text-slate-700" : "text-slate-500"}`}>
                  {atual ? "atual" : s.rotulo}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- 4. Onde trava · o que dispara · quais carretas ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BarraRanking
          titulo="Onde o ciclo está parado"
          subtitulo="Todos os relatos, por etapa. O ideal é tudo descer para a última linha."
          itens={a.ciclo.map((e) => ({ rotulo: e.rotulo, valor: e.valor }))}
          sufixo=""
          formatarValor={(v) => fmt(v)}
          vazio="Nenhum relato ainda."
        />
        <BarraRanking
          titulo="O que mais dispara"
          subtitulo="Relatos por indicador, nos últimos 90 dias."
          itens={a.indicadores.map((i) => ({ rotulo: i.rotulo, valor: i.valor }))}
          sufixo=""
          formatarValor={(v) => fmt(v)}
          vazio="Nenhum disparo em 90 dias. 👏"
        />
        <BarraRanking
          titulo="Carretas que mais aparecem"
          subtitulo="Relatos de TMA por DT e blitz, por placa, nos últimos 90 dias."
          itens={a.placas.map((p) => ({ rotulo: p.rotulo, valor: p.valor, nota: p.nota }))}
          sufixo=""
          tom="vermelho"
          formatarValor={(v) => fmt(v)}
          vazio="Nenhuma carreta repetida em 90 dias."
        />
      </div>
    </div>
  );
}

function Numero({
  valor,
  rotulo,
  rodape,
  tomRodape = null,
}: {
  valor: string;
  rotulo: string;
  rodape: string;
  tomRodape?: "bom" | "ruim" | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-3xl font-extrabold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs font-medium text-slate-600">{rotulo}</p>
      <p
        className={`mt-1.5 text-[11px] ${
          tomRodape === "ruim" ? "font-semibold text-red-700" : tomRodape === "bom" ? "font-semibold text-emerald-700" : "text-slate-400"
        }`}
      >
        {rodape}
      </p>
    </div>
  );
}
