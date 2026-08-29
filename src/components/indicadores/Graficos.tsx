import Link from "next/link";

/**
 * Gráficos compartilhados pelas telas de indicador pessoal (Rating,
 * Refugo). Ficam aqui, e não dentro de uma rota, porque os dois módulos
 * usam a MESMA leitura visual -- calendário do período e barras de
 * ranking -- e duplicar significaria consertar cada ajuste duas vezes.
 *
 * As cores foram escolhidas e CONFERIDAS com o validador de paleta:
 *
 *  - azul do app (--primary) para as barras: uma série só, sem legenda,
 *    porque o título já diz o que está sendo contado;
 *  - verde x âmbar no calendário: passa nos testes de contraste e de
 *    visão normal, mas fica em ΔE 7,9 para protanopia -- por isso o dia
 *    com problema leva anel, contador e legenda, nunca só a cor;
 *  - vermelho x âmbar foi DESCARTADO como par de marcas vizinhas
 *    (ΔE 14,4, difícil de separar até com visão normal). Onde os dois
 *    convivem há rótulo escrito ao lado.
 */
export const COR_AZUL = "#0b4da2";
export const COR_VERDE = "#047857";
export const COR_AMBAR = "#d97706";
/**
 * O terceiro estado do calendário (dia que estourou a meta). O trio
 * verde/âmbar/vermelho passou nas CINCO checagens do validador sem um
 * único aviso -- inclusive na separação para daltonismo, que o par
 * anterior (#059669 + #d97706) não passava.
 *
 * O vermelho é rose-800, não o vermelho comum: com #dc2626 a distância
 * para o âmbar cai para ΔE 14,4, difícil de separar até com visão normal.
 */
export const COR_VERMELHO = "#9f1239";

const NOME_DO_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Um dia do calendário. Quem monta decide o que é "ter movimento" e o
 * que é "ter problema" -- assim o mesmo componente serve para "teve
 * avaliação / teve nota baixa" e para "teve aferição / teve refugo".
 */
export type DiaDaFaixa = {
  dia: string;
  /** 0 = dia sem nada, e o quadrado nasce tracejado e não clicável. */
  total: number;
  /** Quantos problemas no dia. > 0 pinta de âmbar e mostra o contador. */
  alerta: number;
  /** Terceiro estado, opcional: pinta de vermelho. Na devolução é o dia
   *  que estourou a meta -- diferente do dia que só teve devolução. */
  grave?: boolean;
  /** O texto do balão -- a tela sabe o vocabulário, o gráfico não. */
  titulo: string;
};

export type RotulosDaFaixa = {
  titulo: string;
  bom: string;
  alerta: string;
  /** Só aparece na legenda quando algum dia vem com `grave`. */
  grave?: string;
  vazio: string;
  /** Frase do rodapé quando há dias com problema. Recebe a contagem. */
  aviso: (quantos: number) => string;
};

export function FaixaDeDias({
  dias,
  diaSelecionado,
  base,
  rotulos,
}: {
  dias: DiaDaFaixa[];
  diaSelecionado: string | null;
  base: (dia: string) => string;
  rotulos: RotulosDaFaixa;
}) {
  if (dias.length === 0) return null;

  // Um bloco por MÊS. Num período de 90 dias a corrida contínua de
  // quadrados não deixava ver onde um mês termina -- pedido do dono em
  // 29/08/2026. Cada mês reinicia o alinhamento da semana.
  const meses = new Map<string, DiaDaFaixa[]>();
  for (const d of dias) {
    const chave = d.dia.slice(0, 7);
    const lista = meses.get(chave) ?? [];
    lista.push(d);
    meses.set(chave, lista);
  }

  const comMovimento = dias.filter((d) => d.total > 0).length;
  // Quando existe o terceiro estado, o aviso do rodapé fala dele -- na
  // devolução "teve devolução" e "estourou a meta" são coisas diferentes.
  const usaGrave = dias.some((d) => d.grave !== undefined);
  const comProblema = usaGrave
    ? dias.filter((d) => d.grave).length
    : dias.filter((d) => d.alerta > 0).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{rotulos.titulo}</h2>
        <span className="shrink-0 text-xs text-slate-400">
          {comMovimento} de {dias.length} dias
        </span>
      </div>

      <div className="space-y-4">
        {[...meses].map(([chave, doMes]) => (
          <MesDoCalendario
            key={chave}
            chave={chave}
            dias={doMes}
            diaSelecionado={diaSelecionado}
            base={base}
            mostrarNome={meses.size > 1}
          />
        ))}
      </div>

      {/* Legenda sempre presente: a cor nunca carrega o significado sozinha. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: COR_VERDE }} />
          {rotulos.bom}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: COR_AMBAR }} />
          {rotulos.alerta}
        </span>
        {rotulos.grave && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ background: COR_VERMELHO }} />
            {rotulos.grave}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-dashed border-slate-300 bg-slate-50" />
          {rotulos.vazio}
        </span>
      </div>

      {comProblema > 0 && <p className="mt-2 text-[11px] text-amber-700">{rotulos.aviso(comProblema)}</p>}
    </section>
  );
}

function MesDoCalendario({
  chave,
  dias,
  diaSelecionado,
  base,
  mostrarNome,
}: {
  chave: string;
  dias: DiaDaFaixa[];
  diaSelecionado: string | null;
  base: (dia: string) => string;
  mostrarNome: boolean;
}) {
  const [ano, mes] = chave.split("-");
  const primeiro = new Date(`${dias[0].dia}T00:00:00Z`).getUTCDay();
  const comMovimento = dias.filter((d) => d.total > 0).length;
  const problemas = dias.filter((d) => d.alerta > 0).length;

  return (
    <div>
      {mostrarNome && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {NOME_DO_MES[Number(mes) - 1]} <span className="font-normal text-slate-400">{ano}</span>
          </h3>
          <span className="shrink-0 text-[11px] text-slate-400">
            {comMovimento === 0
              ? "sem movimento"
              : `${comMovimento} dia${comMovimento > 1 ? "s" : ""}${problemas ? ` · ${problemas} com alerta` : ""}`}
          </span>
        </div>
      )}
      <div className="grid grid-cols-7 gap-1.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-semibold uppercase text-slate-300">
            {d}
          </span>
        ))}
        {Array.from({ length: primeiro }, (_, i) => (
          <span key={`vazio-${i}`} />
        ))}
        {dias.map((d) => (
          <CelulaDoDia key={d.dia} dia={d} selecionado={d.dia === diaSelecionado} href={base(d.dia)} />
        ))}
      </div>
    </div>
  );
}

function CelulaDoDia({ dia, selecionado, href }: { dia: DiaDaFaixa; selecionado: boolean; href: string }) {
  const numero = dia.dia.slice(8);
  const vazio = dia.total === 0;
  const grave = Boolean(dia.grave);
  const problema = grave || dia.alerta > 0;

  const conteudo = (
    <>
      {numero}
      {/* Codificação secundária: quem não separa as cores enxerga o
          contador, o anel e o "!" do dia grave. */}
      {problema && (
        <span
          className={`absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-black shadow ${
            grave ? "text-rose-800" : "text-amber-700"
          }`}
        >
          {grave ? "!" : dia.alerta}
        </span>
      )}
      {!vazio && !problema && <span className="text-[8px] font-normal opacity-80">{dia.total}</span>}
    </>
  );

  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] font-bold";

  // Dia sem movimento não é link: clicar levaria a uma tela vazia, que
  // parece erro do app em vez de "não teve nada nesse dia".
  if (vazio) {
    return (
      <span
        title={dia.titulo}
        aria-label={dia.titulo}
        className={`${base} cursor-default border border-dashed border-slate-200 bg-slate-50 text-slate-300`}
      >
        {conteudo}
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={dia.titulo}
      aria-label={`${dia.titulo}${selecionado ? " (selecionado — toque para ver o período todo)" : ""}`}
      aria-current={selecionado ? "date" : undefined}
      scroll={false}
      className={`${base} text-white transition-transform hover:scale-110 ${
        selecionado ? "scale-110 ring-2 ring-slate-900 ring-offset-2" : ""
      }`}
      style={{ background: grave ? COR_VERMELHO : dia.alerta > 0 ? COR_AMBAR : COR_VERDE }}
    >
      {conteudo}
    </Link>
  );
}

/**
 * Barra horizontal, uma série só -- por isso sem legenda. O número fica
 * na ponta, não dentro, para caber nome comprido de cidade ou de defeito.
 */
export function BarrasHorizontais({
  titulo,
  subtitulo,
  itens,
  vazio = "Nada no período.",
  maximoDeItens = 8,
  sufixo = "",
}: {
  titulo: string;
  subtitulo?: string;
  itens: { chave: string; total: number }[];
  vazio?: string;
  maximoDeItens?: number;
  sufixo?: string;
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
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
                  {i.total.toLocaleString("pt-BR")}
                  {sufixo}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maior > 0 ? Math.max((i.total / maior) * 100, 3) : 0}%`,
                    background: COR_AZUL,
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
