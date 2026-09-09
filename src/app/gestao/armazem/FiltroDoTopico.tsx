/**
 * O filtro de UM tópico do dashboard.
 *
 * Até 09/09/2026 a tela tinha um filtro só, no topo, e nem todo bloco o
 * respeitava -- o TMA do recebimento, por exemplo, sempre mostrava o
 * geral, porque a carreta não tem coluna de turno e ninguém tinha
 * derivado um. Um filtro que às vezes não filtra é pior que nenhum:
 * quem lê não sabe qual dos números está no recorte.
 *
 * Agora cada tópico carrega o próprio recorte, escrito na URL com o
 * prefixo do tópico (`receb_t`, `receb_c`). O filtro do topo continua
 * existindo e vale como PADRÃO de todos -- quem quiser comparar "manhã
 * no recebimento contra tarde na bancada" muda só o bloco que interessa,
 * e os outros ficam onde estavam.
 *
 * Sem JavaScript de propósito, no mesmo padrão do resto da tela: é um
 * `<form method="get">` que reescreve a URL. Os parâmetros dos OUTROS
 * tópicos viajam como campos escondidos, senão aplicar um filtro
 * limparia todos os demais.
 */

import { ROTULO_TURNO_CURTO, TURNOS, type Turno } from "@/lib/produtividade-armazem";

/** Uma opção da lista de gente. `valor` é o id quando existe; onde a
 *  tabela só guarda o nome (bate palete), o nome é a própria chave. */
export type Pessoa = { valor: string; nome: string };

export function FiltroDoTopico({
  slug,
  turno,
  pessoa,
  pessoas,
  params,
  rotuloPessoa = "Colaborador",
  semTurno = false,
  nota,
}: {
  /** Prefixo dos parâmetros na URL. Curto: ele aparece na barra. */
  slug: string;
  turno: Turno | null;
  pessoa: string;
  pessoas: Pessoa[];
  /** Todos os parâmetros atuais da URL, para os outros tópicos não se perderem. */
  params: [string, string][];
  rotuloPessoa?: string;
  /** Para o bloco cujo dado não tem como ser recortado por turno. */
  semTurno?: boolean;
  nota?: string;
}) {
  const chaveTurno = `${slug}_t`;
  const chavePessoa = `${slug}_c`;
  const outros = params.filter(([k]) => k !== chaveTurno && k !== chavePessoa);

  // A pessoa pode vir do filtro do topo e não ter lançamento NESTE bloco.
  // Sem uma opção para ela, o select cairia em "Todos" enquanto o bloco
  // continua recortado -- a tela diria uma coisa e mostraria outra.
  const listaCompleta: Pessoa[] =
    pessoa && !pessoas.some((p) => p.valor === pessoa)
      ? [...pessoas, { valor: pessoa, nome: "— do filtro geral (sem lançamento aqui)" }]
      : pessoas;

  const campo =
    "rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-primary focus:outline-none";

  return (
    <form method="get" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
      {outros.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {!semTurno && (
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Turno
          <select name={chaveTurno} defaultValue={turno ?? ""} className={campo}>
            <option value="">Todos</option>
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TURNO_CURTO[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {rotuloPessoa}
        <select name={chavePessoa} defaultValue={pessoa} className={`${campo} max-w-[12rem]`}>
          <option value="">Todos</option>
          {listaCompleta.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white"
      >
        Aplicar
      </button>

      {nota && <span className="text-[11px] text-slate-400">{nota}</span>}
    </form>
  );
}

/**
 * A moldura de um tópico: título, o recorte que está valendo escrito por
 * extenso, o filtro e o conteúdo.
 *
 * A tela era uma pilha de blocos soltos, todos com o mesmo peso visual,
 * mais cinco `<details>` no rodapé que misturavam assuntos -- o
 * comparativo de empilhadeira morava na mesma gaveta que o de despejo.
 * Agora cada assunto é um cartão fechado, com o próprio filtro em cima e
 * os próprios comparativos dentro.
 */
export function SecaoDoTopico({
  titulo,
  subtitulo,
  recorte,
  filtro,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** O recorte em vigor, por extenso -- quem lê o número precisa saber de qual recorte ele é. */
  recorte: string;
  filtro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
      </div>

      {filtro}

      <p className="mb-3 text-[11px] font-medium text-slate-400">Mostrando: {recorte}</p>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
