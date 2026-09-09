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
/** Qual turno cobre cada hora do dia -- a mesma régua de ROTULO_TURNO
 *  (T1 05-13, T2 13-21, T3 21-05). Repetida aqui como faixa de fundo
 *  para o gráfico não precisar importar a lib de produtividade. */
function turnoDaHora(h: number): "manha" | "tarde" | "noite" {
  if (h >= 5 && h < 13) return "manha";
  if (h >= 13 && h < 21) return "tarde";
  return "noite";
}

const FUNDO_DO_TURNO = {
  manha: "bg-amber-50/70",
  tarde: "bg-sky-50/70",
  noite: "bg-slate-100/70",
} as const;

const NOME_DO_TURNO = {
  manha: "T1 · 05h–13h",
  tarde: "T2 · 13h–21h",
  noite: "T3 · 21h–05h",
} as const;

export function Histograma({
  titulo,
  subtitulo,
  valores,
  sufixo,
  destaque = "maior",
  casas = 1,
  legendaPico = "hora de pico",
  legendaComum = "demais horas",
}: {
  titulo: string;
  subtitulo?: string;
  /** 24 posições, hora 0 a 23. `null` = sem amostra naquela hora. */
  valores: (number | null)[];
  sufixo: string;
  /** "maior" pinta o pico; "nenhum" mantém tudo do mesmo tom. */
  destaque?: "maior" | "nenhum";
  casas?: number;
  /** O que a cor de destaque significa NESTE gráfico. */
  legendaPico?: string;
  legendaComum?: string;
}) {
  const numeros = valores.map((v) => v ?? 0);
  const maior = Math.max(...numeros);
  const total = numeros.reduce((s, v) => s + v, 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  const horaDoPico = numeros.indexOf(maior);

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}

      {total === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
          Nada no período.
        </p>
      ) : (
        <>
          {/* A LEGENDA DAS DUAS CORES.
              Sem ela, "por que uma barra é amarela e as outras azuis?" é
              a primeira pergunta de quem abre o gráfico -- e uma cor que
              precisa ser perguntada não está informando nada. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gold" />
              {legendaPico}
              {maior > 0 && (
                <strong className="text-slate-700">
                  {" "}
                  ({String(horaDoPico).padStart(2, "0")}h, {fmt(maior)} {sufixo})
                </strong>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
              {legendaComum}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" /> T1
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-100" /> T2
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" /> T3
            </span>
          </div>

          {/* Rola de lado no celular em vez de espremer 24 colunas em
              320px: espremida, cada coluna fica com 6px, o rótulo não
              cabe e o gráfico deixa de ser legível justamente onde ele é
              mais consultado. */}
          <div className="mt-3 overflow-x-auto">
            <div className="flex min-w-[720px] items-end gap-[3px]" style={{ height: 150 }}>
              {valores.map((v, h) => {
                const valor = v ?? 0;
                // 78% e não 100%: o resto da coluna é o espaço do rótulo,
                // que senão ficaria por cima da barra mais alta.
                const alturaPct = maior > 0 ? (valor / maior) * 78 : 0;
                const ehPico = destaque === "maior" && valor === maior && valor > 0;
                const turno = turnoDaHora(h);
                return (
                  <div
                    key={h}
                    className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded-t ${FUNDO_DO_TURNO[turno]}`}
                    title={
                      v === null
                        ? `${String(h).padStart(2, "0")}h (${NOME_DO_TURNO[turno]}): sem amostra`
                        : `${String(h).padStart(2, "0")}h (${NOME_DO_TURNO[turno]}): ${fmt(valor)} ${sufixo}`
                    }
                  >
                    {/* O RÓTULO DE DADOS.
                        Só onde há valor: um "0" repetido em dez colunas
                        vazias vira ruído e some com o número que importa. */}
                    <span
                      className={`mb-0.5 text-center text-[9px] leading-none tabular-nums ${
                        ehPico ? "font-bold text-primary-dark" : "text-slate-500"
                      }`}
                    >
                      {valor > 0 ? fmt(valor) : ""}
                    </span>
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
            {/* Toda hora rotulada, não de 3 em 3: com 720px de largura o
                número cabe, e "qual hora é esta barra?" era a segunda
                pergunta do gráfico. */}
            <div className="mt-1 flex min-w-[720px] gap-[3px] text-[9px] text-slate-400">
              {valores.map((_, h) => (
                <span
                  key={h}
                  className={`min-w-0 flex-1 text-center tabular-nums ${
                    h === horaDoPico ? "font-bold text-slate-700" : ""
                  }`}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Os três melhores e os três piores, lado a lado.
 *
 * Uma lista de 25 produtos não se lê: quem abre a tela quer saber onde
 * está indo bem e onde está indo mal, e as vinte linhas do meio são
 * ruído. A lista completa continua existindo logo abaixo para quem
 * precisar procurar um item específico.
 */
export function TopoEFundo({
  titulo,
  subtitulo,
  itens,
  sufixo,
  rotuloTopo = "Melhores",
  rotuloFundo = "Piores",
  /** Quando barra grande é RUIM (avaria), o topo e o fundo trocam de cor. */
  maiorEhPior = false,
}: {
  titulo: string;
  subtitulo?: string;
  /** Já ordenados do maior para o menor. */
  itens: ItemBarra[];
  sufixo: string;
  rotuloTopo?: string;
  rotuloFundo?: string;
  maiorEhPior?: boolean;
}) {
  // Com 6 itens ou menos, topo e fundo se sobrepõem e a divisão mente:
  // o terceiro melhor seria também o quarto pior. Aí mostra a lista toda.
  if (itens.length === 0) return null;
  const cabeInteira = itens.length <= 6;
  const topo = cabeInteira ? itens : itens.slice(0, 3);
  const fundo = cabeInteira ? [] : itens.slice(-3).reverse();

  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const linha = (item: ItemBarra, bom: boolean, i: number) => (
    <li key={`${item.rotulo}-${i}`} className="flex items-baseline justify-between gap-2" title={item.detalhe}>
      <span className="min-w-0 truncate text-xs text-slate-700">
        <span className="mr-1 text-slate-400 tabular-nums">{i + 1}.</span>
        {item.rotulo}
      </span>
      <span className={`shrink-0 text-xs font-bold tabular-nums ${bom ? "text-green-700" : "text-red-700"}`}>
        {fmt(item.valor)} {sufixo}
      </span>
    </li>
  );

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {subtitulo && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitulo}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {cabeInteira ? "Todos" : `🔝 ${rotuloTopo}`}
          </p>
          <ul className="space-y-1">{topo.map((it, i) => linha(it, !maiorEhPior, i))}</ul>
        </div>
        {fundo.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              🔻 {rotuloFundo}
            </p>
            <ul className="space-y-1">{fundo.map((it, i) => linha(it, maiorEhPior, i))}</ul>
          </div>
        )}
      </div>
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
  // Passou da capacidade: o desenho fica cheio e âmbar. "180% cheia" não
  // existe, e o excesso é justamente o aviso de que já passou da hora.
  const transbordou = litros > capacidade;
  const falta = Math.max(capacidade - litros, 0);

  // Uma barra dizia "82%" e não dizia nada sobre um recipiente. O
  // desenho enche de baixo para cima como a bombona de verdade, e "está
  // quase transbordando" se lê antes de ler qualquer número -- que é
  // exatamente a decisão que este cartão existe para apoiar.
  //
  // Geometria do corpo, em coordenadas do SVG: começa em y=22 e termina
  // em y=140. A altura do líquido sai daí.
  const TOPO = 22;
  const BASE = 140;
  const ALTURA = BASE - TOPO;
  const alturaLiquido = (pct / 100) * ALTURA;
  const yLiquido = BASE - alturaLiquido;
  const corLiquido = transbordou ? "#f59e0b" : pct >= 80 ? "#eab308" : "#0ea5e9";

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

      <div className="mt-2 flex items-center gap-4">
        <svg
          viewBox="0 0 100 150"
          className="h-36 w-24 shrink-0"
          role="img"
          aria-label={`Bombona ${Math.round(pct)}% cheia, ${litros} de ${capacidade} litros`}
        >
          {/* Tampa e alça: é o que faz o desenho ser lido como bombona e
              não como um copo ou uma bateria. */}
          <rect x="38" y="2" width="24" height="10" rx="2" fill="#94a3b8" />
          <path
            d="M62 5 h10 a4 4 0 0 1 4 4 v6 a4 4 0 0 1 -4 4 h-4"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Corpo. O líquido é recortado por ele (clipPath), então ele
              acompanha o cantinho arredondado em vez de vazar por cima. */}
          <defs>
            <clipPath id="corpo-da-bombona">
              <rect x="14" y={TOPO} width="72" height={ALTURA} rx="10" />
            </clipPath>
          </defs>

          <rect x="14" y={TOPO} width="72" height={ALTURA} rx="10" fill="#f1f5f9" />

          <g clipPath="url(#corpo-da-bombona)">
            {alturaLiquido > 0 && (
              <>
                <rect x="14" y={yLiquido} width="72" height={alturaLiquido + 2} fill={corLiquido} />
                {/* A ondinha da superfície: dois arcos rasos. Sem ela o
                    líquido vira um retângulo e o desenho perde a leitura
                    de "recipiente com coisa dentro". */}
                <path
                  d={`M14 ${yLiquido} q 9 -5 18 0 t 18 0 t 18 0 t 18 0 v 6 h -72 z`}
                  fill={corLiquido}
                  opacity="0.85"
                />
              </>
            )}
          </g>

          {/* As marcas de nível da lateral, como as da bombona real. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="70"
              x2="82"
              y1={BASE - f * ALTURA}
              y2={BASE - f * ALTURA}
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}

          <rect
            x="14"
            y={TOPO}
            width="72"
            height={ALTURA}
            rx="10"
            fill="none"
            stroke={transbordou ? "#d97706" : "#94a3b8"}
            strokeWidth="3"
          />
        </svg>

        <div className="min-w-0">
          <p className={`text-3xl font-extrabold ${transbordou ? "text-amber-700" : "text-slate-900"}`}>
            {litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
          </p>
          <p className="text-sm font-semibold text-slate-500">{Math.round(pct)}% da bombona</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {transbordou
              ? `Passou da capacidade em ${(litros - capacidade).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L — já era para ter esvaziado.`
              : `Cabem mais ${falta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L.`}
          </p>
          {desde && <p className="mt-1 text-[11px] text-slate-400">Contando desde {desde}.</p>}
        </div>
      </div>

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
