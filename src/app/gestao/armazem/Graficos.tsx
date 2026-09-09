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

/**
 * Perfil por hora do dia -- 24 colunas, uma por hora.
 *
 * Barra vertical aqui e horizontal no resto da tela de propósito: hora
 * do dia é uma sequência, e sequência se lê da esquerda para a direita.
 * A mesma barra horizontal do ranking transformaria "as 7h da manhã" num
 * item de lista qualquer, e o pico -- que é a informação inteira deste
 * gráfico -- desapareceria no meio da ordenação.
 *
 * As horas sem nada continuam desenhadas, como um traço na base: é o
 * vale que conta metade da história ("das 13h às 15h a máquina para").
 */
export function Histograma({
  titulo,
  subtitulo,
  valores,
  sufixo,
  destaque = "maior",
  casas = 1,
}: {
  titulo: string;
  subtitulo?: string;
  /** 24 posições, hora 0 a 23. `null` = sem amostra naquela hora. */
  valores: (number | null)[];
  sufixo: string;
  /** "maior" pinta o pico; "nenhum" mantém tudo do mesmo tom. */
  destaque?: "maior" | "nenhum";
  casas?: number;
}) {
  const numeros = valores.map((v) => v ?? 0);
  const maior = Math.max(...numeros);
  const total = numeros.reduce((s, v) => s + v, 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitulo}</p>}

      {total === 0 ? (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
          Nada no período.
        </p>
      ) : (
        // Rola de lado no celular em vez de espremer 24 colunas em 320px:
        // espremida, cada coluna fica com 6px e o gráfico deixa de ser
        // legível justamente onde ele é mais consultado.
        <div className="mt-3 overflow-x-auto">
          <div className="flex min-w-[560px] items-end gap-[3px]" style={{ height: 120 }}>
            {valores.map((v, h) => {
              const valor = v ?? 0;
              const alturaPct = maior > 0 ? (valor / maior) * 100 : 0;
              const ehPico = destaque === "maior" && valor === maior && valor > 0;
              return (
                <div
                  key={h}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={
                    v === null
                      ? `${String(h).padStart(2, "0")}h: sem amostra`
                      : `${String(h).padStart(2, "0")}h: ${fmt(valor)} ${sufixo}`
                  }
                >
                  <div
                    className={`w-full rounded-t ${ehPico ? "bg-gold" : "bg-primary"}`}
                    // 2px de piso para a hora vazia continuar visível
                    // como base do gráfico, e não como buraco.
                    style={{ height: `${Math.max(alturaPct, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex min-w-[560px] gap-[3px] text-[9px] text-slate-400">
            {valores.map((_, h) => (
              <span key={h} className="min-w-0 flex-1 text-center tabular-nums">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
        </div>
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
 * Termômetro: quanto tem DENTRO da bombona agora.
 *
 * Este cartão é o único da tela que ignora todos os filtros, e é de
 * propósito. A bombona é um recipiente físico: ela não tem turno nem
 * dono, e a pergunta que se faz olhando para ela é "quanto ainda cabe
 * antes de encher". Antes o número era o total do período filtrado, e aí
 * o T1 via a bombona pela metade e o T2 via vazia -- sendo a MESMA
 * bombona. Quem precisava decidir a hora de descartar não tinha número.
 *
 * A conta começa no último esvaziamento registrado (migration 110); sem
 * nenhum, começa no primeiro lançamento que existe.
 */
export function TermometroDaBombona({
  litros,
  capacidade,
  desde,
  rodape,
}: {
  /** Litros despejados desde o último esvaziamento -- sem recorte nenhum. */
  litros: number;
  capacidade: number;
  /** Quando a contagem atual começou, já formatado. */
  desde?: string;
  /** O botão de esvaziar e o que mais precise assinar o cartão. */
  rodape?: React.ReactNode;
}) {
  if (capacidade <= 0) return null;

  const pct = Math.min((litros / capacidade) * 100, 100);
  // Passou da capacidade: a barra fica cheia e âmbar. Barra "180%" não
  // existe, e o excesso é justamente o aviso de que já passou da hora.
  const transbordou = litros > capacidade;
  const falta = Math.max(capacidade - litros, 0);

  return (
    <div className="col-span-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Na bombona agora
        </p>
        <p className="shrink-0 text-[11px] text-slate-400">
          capacidade {capacidade.toLocaleString("pt-BR")} L · não segue os filtros
        </p>
      </div>

      <p className={`mt-1 text-3xl font-extrabold ${transbordou ? "text-amber-700" : "text-slate-900"}`}>
        {litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
      </p>

      <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100" role="img"
        aria-label={`${Math.round(pct)}% da bombona`}>
        <div
          className={`h-4 rounded-full transition-all ${transbordou ? "bg-amber-500" : pct >= 80 ? "bg-gold" : "bg-primary"}`}
          // 2px de mínimo: barra de largura zero some, e some sem dizer
          // que o valor é pequeno -- parece que não carregou.
          style={{ width: `${Math.max(pct, litros > 0 ? 2 : 0)}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        {transbordou
          ? `Passou da capacidade em ${(litros - capacidade).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L — já era para ter esvaziado.`
          : `${Math.round(pct)}% cheia — cabem mais ${falta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L.`}
        {desde && ` Contando desde ${desde}.`}
      </p>

      {rodape && <div className="mt-3 border-t border-slate-100 pt-3">{rodape}</div>}
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
