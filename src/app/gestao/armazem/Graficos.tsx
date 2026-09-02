/**
 * Peças visuais do dashboard -- sempre a mesma forma (barra horizontal,
 * um hue só, comprimento = magnitude), porque é a leitura mais rápida
 * pra comparar gente/turno/máquina numa lista. Sem biblioteca de
 * gráfico: SVG/CSS puro, e a dica ao passar o mouse (`title`) já cobre
 * o essencial de interação sem precisar de JavaScript no cliente.
 */

import type { LeituraDaMeta } from "@/lib/metas";

export type ItemBarra = {
  rotulo: string;
  valor: number;
  detalhe?: string;
};

const TOM = {
  primary: { barra: "bg-primary", texto: "text-primary-dark" },
  gold: { barra: "bg-gold", texto: "text-primary-dark" },
  // Vermelho para o que se quer ver CAIR -- a avaria do bate palete. Nos
  // outros rankings a barra grande é boa; ali ela é o problema, e usar a
  // mesma cor faria o pior produto parecer o campeão.
  vermelho: { barra: "bg-red-500", texto: "text-red-700" },
} as const;

export function BarraRanking({
  titulo,
  subtitulo,
  itens,
  sufixo,
  tom = "primary",
  vazio = "Nada no período.",
  formatarValor,
}: {
  titulo: string;
  subtitulo?: string;
  itens: ItemBarra[];
  sufixo: string;
  tom?: keyof typeof TOM;
  vazio?: string;
  formatarValor?: (v: number) => string;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  const cor = TOM[tom];
  const fmt = formatarValor ?? ((v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  return (
    // `min-w-0` também aqui: como item de grid, este cartão herda
    // min-width auto e esticaria junto com o conteúdo mais largo.
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
      {itens.length === 0 ? (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {itens.map((item) => (
            <li key={item.rotulo} title={item.detalhe ?? `${item.rotulo}: ${fmt(item.valor)} ${sufixo}`}>
              {/* `min-w-0` é o que faz o `truncate` funcionar: sem ele o
                  item de flex se recusa a encolher abaixo do próprio texto,
                  o corte nunca acontece e nomes longos de produto
                  ("ORIGINAL LT 269ML SH C15 NPAL") empurram o cartão para
                  fora da tela -- a página inteira passava a rolar de lado
                  no celular ao expandir a seção. */}
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-slate-700">{item.rotulo}</span>
                <span className={`shrink-0 font-bold ${cor.texto}`}>
                  {fmt(item.valor)} {sufixo}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${cor.barra} transition-[width]`}
                  style={{ width: `${Math.max(3, (item.valor / maior) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Agrupa os cartões-hero de UMA atividade sob um título -- sem isso,
 *  reepack/despejo/empilhadeira/recebimento viravam uma fileira só de
 *  números soltos, sem deixar claro qual pertence a qual. */
export function BlocoAtividade({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * Cartão de número grande.
 *
 * Com `meta`, ele se pinta sozinho: fundo verde claro batendo, vermelho
 * claro não batendo, e a diferença aparece embaixo em texto discreto --
 * quem já viu a cor não precisa ler o resto, e quem quer o tamanho do
 * buraco tem o número ali sem o cartão virar um relatório.
 *
 * `alerta`/`positivo` continuam para os cartões que não têm meta
 * cadastrada e usam régua própria.
 */
/**
 * Termômetro: quanto do volume já foi despejado, contra a capacidade da
 * bombona.
 *
 * O número da tela é o TOTAL DO PERÍODO, não o que está dentro da
 * bombona agora -- e isso muda a leitura. Num período curto ele responde
 * "falta quanto para encher"; num longo, "quantas bombonas isso deu". O
 * rodapé diz qual dos dois está acontecendo em vez de deixar quem lê
 * concluir a coisa errada.
 */
export function TermometroDaBombona({
  litros,
  capacidade,
}: {
  litros: number;
  capacidade: number;
}) {
  if (capacidade <= 0) return null;

  const bombonas = litros / capacidade;
  const cheias = Math.floor(bombonas);
  const restoPct = Math.min((bombonas - cheias) * 100, 100);
  // Encheu pelo menos uma: a barra fica cheia, e a contagem embaixo é que
  // conta a história. Barra "180%" não existe.
  const preenchido = cheias >= 1 ? 100 : restoPct;
  const transbordou = cheias >= 1;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Litros despejados
        </p>
        <p className="shrink-0 text-[11px] text-slate-400">
          bombona de {capacidade.toLocaleString("pt-BR")} L
        </p>
      </div>

      <p className="mt-1 text-3xl font-extrabold text-slate-900">
        {litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
      </p>

      <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100" role="img"
        aria-label={`${Math.round(preenchido)}% da bombona`}>
        <div
          className={`h-4 rounded-full transition-all ${transbordou ? "bg-amber-500" : "bg-primary"}`}
          // 2px de mínimo: barra de largura zero some, e some sem dizer
          // que o valor é pequeno -- parece que não carregou.
          style={{ width: `${Math.max(preenchido, litros > 0 ? 2 : 0)}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        {litros === 0
          ? "Nada despejado no período."
          : transbordou
            ? `${bombonas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bombona(s) no período` +
              (restoPct > 0 ? ` — a última em ${Math.round(restoPct)}%` : "")
            : `${Math.round(restoPct)}% da bombona — faltam ${(capacidade - litros).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L para encher`}
      </p>
    </div>
  );
}

export function CartaoHero({
  titulo,
  valor,
  legenda,
  alerta = false,
  positivo = false,
  meta,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  alerta?: boolean;
  positivo?: boolean;
  meta?: LeituraDaMeta | null;
}) {
  // A meta manda na cor quando existe: ela é a régua da operação, não um
  // limiar escrito no código.
  const ruim = meta ? !meta.batendo : alerta;
  const bom = meta ? meta.batendo : positivo;

  return (
    <div
      className={`min-w-0 rounded-2xl border p-4 shadow-sm ${
        ruim ? "border-red-200 bg-red-50" : bom ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p
        className={`mt-1 break-words text-3xl font-extrabold ${
          ruim ? "text-red-700" : bom ? "text-green-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {legenda && <p className="mt-1 text-xs text-slate-500">{legenda}</p>}
      {meta && (
        // Discreto de propósito: é a informação de terceiro nível do
        // cartão, depois do número e da cor.
        <p className={`mt-1 text-[11px] ${ruim ? "text-red-600/70" : "text-green-700/70"}`}>
          {meta.batendo ? "✓ " : ""}
          {meta.texto}
        </p>
      )}
    </div>
  );
}
