/**
 * As peças visuais do painel do Desafio.
 *
 * Mesma linguagem do painel do Armazém -- barra horizontal para
 * comparar itens de uma lista, coluna vertical para o que é uma
 * sequência (nota 0, 1, 2... 10). Sem biblioteca de gráfico: SVG e CSS,
 * que é o que o resto do app já faz.
 *
 * A cor aqui SEMPRE significa a mesma coisa: verde ≥80% de acerto,
 * âmbar entre 60 e 79, vermelho abaixo de 60. A régua está em
 * lib/desafio-analise (tomDoAcerto) e é a mesma nos cartões, nas barras
 * e na lista de perguntas -- um verde numa parte da tela e na outra não
 * faria a leitura recomeçar a cada bloco.
 */

import type { GrupoDeAcerto } from "@/lib/desafio-analise";
import { tomDoAcerto } from "@/lib/desafio-analise";

const TOM = {
  bom: { fundo: "border-green-200 bg-green-50", texto: "text-green-700", barra: "bg-green-500" },
  atencao: { fundo: "border-amber-200 bg-amber-50", texto: "text-amber-800", barra: "bg-amber-500" },
  ruim: { fundo: "border-red-200 bg-red-50", texto: "text-red-700", barra: "bg-red-500" },
  neutro: { fundo: "border-slate-200 bg-white", texto: "text-slate-900", barra: "bg-slate-400" },
} as const;

export function CartaoDesafio({
  titulo,
  valor,
  legenda,
  tom = "neutro",
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  tom?: keyof typeof TOM;
}) {
  const c = TOM[tom];
  return (
    <div className={`min-w-0 rounded-2xl border p-4 shadow-sm ${c.fundo}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 break-words text-3xl font-extrabold ${c.texto}`}>{valor}</p>
      {legenda && <p className="mt-1 text-xs text-slate-500">{legenda}</p>}
    </div>
  );
}

/**
 * Acerto por grupo -- POP de origem, dificuldade, pilar.
 *
 * A barra vai de 0 a 100 SEMPRE, e não do maior valor da lista. Numa
 * escala relativa, um grupo com 55% de acerto encostaria na direita se
 * fosse o melhor da lista, e "quase cheio" é exatamente a leitura
 * errada: 55% é metade da equipe sem saber o procedimento.
 */
export function BarraDeAcerto({
  titulo,
  subtitulo,
  itens,
}: {
  titulo: string;
  subtitulo?: string;
  itens: GrupoDeAcerto[];
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitulo}</p>}

      {itens.length === 0 ? (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
          Nada respondido no período.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {itens.map((g) => {
            const c = TOM[tomDoAcerto(g.pctAcerto)];
            return (
              <li key={g.chave} title={`${g.chave}: ${g.acertos} de ${g.respondida} respostas certas`}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-slate-700">
                    {g.chave}
                    <span className="ml-1.5 font-normal text-slate-400 tabular-nums">
                      ({g.questoes} {g.questoes === 1 ? "pergunta" : "perguntas"})
                    </span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${c.texto}`}>{g.pctAcerto}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-2.5 rounded-full ${c.barra}`}
                    style={{ width: `${Math.max(g.pctAcerto, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Quantas pessoas tiraram cada nota.
 *
 * Coluna e não barra horizontal porque a nota é uma SEQUÊNCIA (0, 1,
 * 2... 10): a forma da distribuição -- um monte no meio, dois montes
 * nas pontas -- é a informação, e ela só aparece com as notas em ordem
 * da esquerda para a direita.
 */
export function ColunasDeNota({
  titulo,
  subtitulo,
  faixas,
  totalPerguntas,
}: {
  titulo: string;
  subtitulo?: string;
  faixas: { acertos: number; pessoas: number }[];
  totalPerguntas: number;
}) {
  const maior = Math.max(1, ...faixas.map((f) => f.pessoas));
  const total = faixas.reduce((s, f) => s + f.pessoas, 0);

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}

      {total === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
          Ninguém concluiu ainda.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-1" style={{ height: 130 }}>
            {faixas.map((f) => {
              // A cor da coluna é a nota QUE ELA REPRESENTA, não o
              // tamanho dela: uma coluna alta em "3 acertos" é o pior
              // resultado possível, e pintá-la de verde por ser a maior
              // inverteria a leitura inteira.
              const pctDaNota = totalPerguntas > 0 ? (f.acertos / totalPerguntas) * 100 : 0;
              const c = TOM[tomDoAcerto(pctDaNota)];
              const altura = (f.pessoas / maior) * 78;
              return (
                <div
                  key={f.acertos}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${f.pessoas} pessoa(s) acertaram ${f.acertos} de ${totalPerguntas}`}
                >
                  <span className="mb-0.5 text-center text-[9px] leading-none tabular-nums text-slate-500">
                    {f.pessoas > 0 ? f.pessoas : ""}
                  </span>
                  <div
                    className={`w-full rounded-t ${f.pessoas > 0 ? c.barra : "bg-slate-100"}`}
                    style={{ height: `${Math.max(altura, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1 text-[9px] text-slate-400">
            {faixas.map((f) => (
              <span key={f.acertos} className="min-w-0 flex-1 text-center tabular-nums">
                {f.acertos}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">acertos, de {totalPerguntas}</p>
        </>
      )}
    </div>
  );
}
