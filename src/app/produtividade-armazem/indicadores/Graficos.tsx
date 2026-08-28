/**
 * Peças visuais do dashboard -- sempre a mesma forma (barra horizontal,
 * um hue só, comprimento = magnitude), porque é a leitura mais rápida
 * pra comparar gente/turno/máquina numa lista. Sem biblioteca de
 * gráfico: SVG/CSS puro, e a dica ao passar o mouse (`title`) já cobre
 * o essencial de interação sem precisar de JavaScript no cliente.
 */

export type ItemBarra = {
  rotulo: string;
  valor: number;
  detalhe?: string;
};

const TOM = {
  primary: { barra: "bg-primary", texto: "text-primary-dark" },
  gold: { barra: "bg-gold", texto: "text-primary-dark" },
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

export function CartaoHero({
  titulo,
  valor,
  legenda,
  alerta = false,
  positivo = false,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  alerta?: boolean;
  positivo?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        alerta ? "border-red-200 bg-red-50" : positivo ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p
        className={`mt-1 text-3xl font-extrabold ${
          alerta ? "text-red-700" : positivo ? "text-green-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {legenda && <p className="mt-1 text-xs text-slate-500">{legenda}</p>}
    </div>
  );
}
