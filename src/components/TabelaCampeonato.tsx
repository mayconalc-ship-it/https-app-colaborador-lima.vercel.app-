import { aproveitamento, medalha, mesCurto } from "@/lib/quiz";

/**
 * A classificação em forma de tabela de campeonato.
 *
 * O formato é o de tabela esportiva porque é o formato que o time já sabe
 * ler sem legenda: posição à esquerda, nome, e os números à direita.
 * A faixa colorida na lateral marca a zona de premiação -- as três
 * primeiras posições, que são as premiadas da rodada.
 *
 * Nada aqui é identidade visual de campeonato nenhum: é a mesma paleta do
 * app (azul e dourado da marca).
 */

type LinhaBase = {
  colaboradorId: string;
  nome: string;
  pontos: number;
  acertos: number;
  jogos: number;
  totalPerguntas: number;
  posicao: number;
  posicaoAnterior?: number | null;
};

/** Só o primeiro nome + inicial do sobrenome: cabe no celular. */
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

function Seta({ atual, anterior }: { atual: number; anterior?: number | null }) {
  if (anterior == null) {
    return (
      <span className="text-slate-300" title="Primeira rodada da pessoa">
        •
      </span>
    );
  }
  if (anterior === atual) return <span className="text-slate-400">–</span>;
  return anterior > atual ? (
    <span className="text-emerald-600" title={`Subiu de ${anterior}º`}>
      ▲
    </span>
  ) : (
    <span className="text-rose-500" title={`Caiu de ${anterior}º`}>
      ▼
    </span>
  );
}

function Posicao({ posicao }: { posicao: number }) {
  const m = medalha(posicao);
  return (
    <span className="inline-flex items-center gap-1 font-bold tabular-nums">
      {m ?? posicao}
      {m && <span className="text-xs text-slate-500">{posicao}º</span>}
    </span>
  );
}

/** Realce da zona de premiação e da linha de quem está lendo. */
function classeDaLinha(posicao: number, ehVoce: boolean) {
  const zona =
    posicao <= 3
      ? "border-l-4 border-l-gold"
      : "border-l-4 border-l-transparent";
  const minha = ehVoce ? "bg-primary-soft font-semibold" : "";
  return `${zona} ${minha}`;
}

export function TabelaRodada({
  linhas,
  euId,
  mostrarVariacao = true,
}: {
  linhas: LinhaBase[];
  euId: string;
  mostrarVariacao?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-primary text-left text-xs uppercase tracking-wide text-white">
            <th className="px-2 py-2.5 text-right">Pos.</th>
            {mostrarVariacao && <th className="w-6 px-1 py-2.5"></th>}
            <th className="px-2 py-2.5">Colaborador</th>
            <th className="px-2 py-2.5 text-right">PTS</th>
            <th className="px-2 py-2.5 text-right">J</th>
            <th className="px-2 py-2.5 text-right">Acertos</th>
            <th className="px-2 py-2.5 text-right">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <tr
              key={l.colaboradorId}
              className={classeDaLinha(l.posicao, l.colaboradorId === euId)}
            >
              <td className="px-2 py-2.5 text-right">
                <Posicao posicao={l.posicao} />
              </td>
              {mostrarVariacao && (
                <td className="px-1 py-2.5 text-center text-xs">
                  <Seta atual={l.posicao} anterior={l.posicaoAnterior} />
                </td>
              )}
              <td className="px-2 py-2.5 text-slate-800">
                {nomeCurto(l.nome)}
                {l.colaboradorId === euId && (
                  <span className="ml-1 text-xs text-primary">(você)</span>
                )}
              </td>
              <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900">
                {l.pontos}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">
                {l.jogos}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                {l.acertos}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                {aproveitamento(l.acertos, l.totalPerguntas)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaTemporada({
  linhas,
  meses,
  euId,
}: {
  linhas: (LinhaBase & { porMes: Record<number, number> })[];
  meses: number[];
  euId: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-primary text-left text-xs uppercase tracking-wide text-white">
            <th className="px-2 py-2.5 text-right">Pos.</th>
            <th className="px-2 py-2.5">Colaborador</th>
            {meses.map((m) => (
              <th key={m} className="px-2 py-2.5 text-right">
                {mesCurto(m)}
              </th>
            ))}
            <th className="px-2 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <tr
              key={l.colaboradorId}
              className={classeDaLinha(l.posicao, l.colaboradorId === euId)}
            >
              <td className="px-2 py-2.5 text-right">
                <Posicao posicao={l.posicao} />
              </td>
              <td className="px-2 py-2.5 text-slate-800">
                {nomeCurto(l.nome)}
                {l.colaboradorId === euId && (
                  <span className="ml-1 text-xs text-primary">(você)</span>
                )}
              </td>
              {meses.map((m) => (
                <td
                  key={m}
                  className="px-2 py-2.5 text-right tabular-nums text-slate-600"
                >
                  {l.porMes[m] ?? "–"}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900">
                {l.pontos}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A linha "Sua posição", mostrada quando quem lê está fora do Top N.
 *
 * Aparece separada, e não estendendo a tabela: o pedido é justamente não
 * revelar as outras posições de fora da faixa. Quem está em 17º vê o
 * próprio 17º, não os quinze nomes entre ele e o Top 8.
 */
export function MinhaLinha({
  posicao,
  nome,
  pontos,
  acertos,
  totalPerguntas,
  total,
}: {
  posicao: number;
  nome: string;
  pontos: number;
  acertos: number;
  totalPerguntas: number;
  total: number;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-center text-lg leading-none text-slate-300">···</p>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Sua posição
      </p>
      <div className="flex items-center gap-3 rounded-2xl border-l-4 border-l-primary border border-slate-200 bg-primary-soft px-3 py-3 shadow-sm">
        <span className="text-lg font-bold tabular-nums text-primary-dark">
          {posicao}º
        </span>
        <span className="flex-1 truncate font-semibold text-slate-800">
          {nomeCurto(nome)}
        </span>
        <span className="text-right">
          <span className="block font-bold tabular-nums text-slate-900">
            {pontos} pts
          </span>
          <span className="block text-xs text-slate-500">
            {acertos} acertos · {aproveitamento(acertos, totalPerguntas)}%
          </span>
        </span>
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-400">
        {posicao}º de {total} participantes
      </p>
    </div>
  );
}
