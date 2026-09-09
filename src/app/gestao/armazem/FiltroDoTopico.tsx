"use client";

/**
 * A sanfona de tópicos e o filtro de cada um.
 *
 * Por que virou componente de cliente (era `<form method="get">`):
 *
 * 1. Aplicar um filtro recarregava a página e jogava a leitura de volta
 *    para o topo. Quem estava olhando o Recebimento no fim da tela tinha
 *    de rolar tudo de novo a cada troca de turno. `router.replace` com
 *    `scroll: false` troca a URL sem mexer na rolagem.
 * 2. A sanfona precisa continuar aberta depois de filtrar. Com `<form>`
 *    a página remontava fechada.
 * 3. O "Todos" ficava preso. O filtro do topo era o padrão de quem não
 *    tinha recorte próprio, e "" (Todos) era indistinguível de "não
 *    escolhi nada" -- então escolher T3 no topo e Todos no bloco caía de
 *    volta em T3. Agora o parâmetro do bloco é SEMPRE escrito na URL, e
 *    "ausente" (herda o topo) é coisa diferente de "" (todos, escolhido).
 */

import { useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ROTULO_TURNO_CURTO, TURNOS, type Turno } from "@/lib/produtividade-armazem";

/** Uma opção da lista de gente. `valor` é o id quando existe; onde a
 *  tabela só guarda o nome, o nome é a própria chave. */
export type Pessoa = { valor: string; nome: string };

/** Uma escolha qualquer além de turno e pessoa (tipo de ressuprimento, papel...). */
export type OpcaoExtra = {
  /** Sufixo do parâmetro: vira `<slug>_<chave>` na URL. */
  chave: string;
  rotulo: string;
  valor: string;
  opcoes: { valor: string; nome: string }[];
};

const CAMPO =
  "rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-primary focus:outline-none";
const ROTULO = "flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export function FiltroDoTopico({
  slug,
  turno,
  pessoa,
  pessoas,
  extras = [],
  rotuloPessoa = "Colaborador",
  semTurno = false,
  nota,
}: {
  /** Prefixo dos parâmetros na URL. Curto: ele aparece na barra. */
  slug: string;
  turno: Turno | null;
  pessoa: string;
  pessoas: Pessoa[];
  extras?: OpcaoExtra[];
  rotuloPessoa?: string;
  /** Para o bloco cujo dado não tem como ser recortado por turno. */
  semTurno?: boolean;
  nota?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Escreve o parâmetro e recarrega os dados SEM mexer na rolagem.
   *
   * O valor vai para a URL mesmo vazio: é o que distingue "escolhi
   * Todos" de "não escolhi nada" -- ver o comentário no topo do arquivo.
   */
  const aplicar = (chave: string, valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(chave, valor);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // A pessoa pode vir do filtro do topo e não ter lançamento NESTE bloco.
  // Sem uma opção para ela, o select cairia em "Todos" enquanto o bloco
  // continua recortado -- a tela diria uma coisa e mostraria outra.
  const listaCompleta: Pessoa[] =
    pessoa && !pessoas.some((p) => p.valor === pessoa)
      ? [...pessoas, { valor: pessoa, nome: "— do filtro geral (sem lançamento aqui)" }]
      : pessoas;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
      {!semTurno && (
        <label className={ROTULO}>
          Turno
          <select
            value={turno ?? ""}
            onChange={(e) => aplicar(`${slug}_t`, e.target.value)}
            className={CAMPO}
          >
            <option value="">Todos</option>
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TURNO_CURTO[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={ROTULO}>
        {rotuloPessoa}
        <select
          value={pessoa}
          onChange={(e) => aplicar(`${slug}_c`, e.target.value)}
          className={`${CAMPO} max-w-[12rem]`}
        >
          <option value="">Todos</option>
          {listaCompleta.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      {extras.map((x) => (
        <label key={x.chave} className={ROTULO}>
          {x.rotulo}
          <select
            value={x.valor}
            onChange={(e) => aplicar(`${slug}_${x.chave}`, e.target.value)}
            className={CAMPO}
          >
            {x.opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
      ))}

      {nota && <span className="text-[11px] text-slate-400">{nota}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------
   O aberto/fechado da sanfona, guardado no navegador de quem lê.

   Sete tópicos e ninguém abre a página para ler os sete: quem sempre
   olha o Recebimento reencontra ele aberto no dia seguinte, e a tela
   nasce curta para os outros. Um `Set` de assinantes porque
   `localStorage` não avisa a própria aba quando ela mesma escreve.
   ------------------------------------------------------------------ */

const assinantesDaSanfona = new Set<() => void>();

function assinarSanfona(aoMudar: () => void) {
  assinantesDaSanfona.add(aoMudar);
  return () => {
    assinantesDaSanfona.delete(aoMudar);
  };
}

/**
 * A verdade da vez fica em memória; `localStorage` é só a persistência.
 *
 * Sem este mapa, um navegador com armazenamento bloqueado (janela
 * anônima, cookies de terceiros desligados) teria a sanfona TRAVADA
 * fechada: o clique gravaria em lugar nenhum e a leitura seguinte
 * devolveria "fechada" de novo.
 */
const sanfonaEmMemoria = new Map<string, boolean>();

function secaoAberta(chave: string) {
  const emMemoria = sanfonaEmMemoria.get(chave);
  if (emMemoria !== undefined) return emMemoria;
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

function gravarSecao(chave: string, aberta: boolean) {
  sanfonaEmMemoria.set(chave, aberta);
  try {
    localStorage.setItem(chave, aberta ? "1" : "0");
  } catch {
    // A sanfona simplesmente não lembra entre visitas -- dentro da
    // visita ela funciona, que é o que importa para ler a tela.
  }
  for (const aoMudar of assinantesDaSanfona) aoMudar();
}

/**
 * Um tópico da sanfona.
 *
 * Nasce FECHADO. A tela tem sete assuntos e ninguém abre a página para
 * ler os sete -- aberta por inteiro ela era uma rolagem sem fim, que foi
 * a queixa original. Fechada, o índice do que existe cabe numa tela.
 *
 * O aberto/fechado fica no navegador de quem lê (`localStorage`), então
 * quem sempre olha o Recebimento reencontra ele aberto no dia seguinte.
 * Ler no primeiro render quebraria a hidratação (o servidor não tem
 * `localStorage`), por isso a leitura é no `useEffect`.
 */
export function SecaoDoTopico({
  slug,
  titulo,
  subtitulo,
  resumo,
  recorte,
  filtro,
  children,
}: {
  slug: string;
  titulo: string;
  subtitulo?: string;
  /** O número-chave do tópico, visível com a sanfona fechada. */
  resumo?: string;
  /** O recorte em vigor, por extenso -- quem lê o número precisa saber de qual recorte ele é. */
  recorte: string;
  filtro: React.ReactNode;
  children: React.ReactNode;
}) {
  const chave = `armazem:secao:${slug}`;
  // `localStorage` é um sistema externo, então quem lê é
  // useSyncExternalStore e não um useState sincronizado no efeito: o
  // servidor devolve "fechado" e o navegador corrige na primeira
  // pintura, sem render em cascata.
  const aberto = useSyncExternalStore(assinarSanfona, () => secaoAberta(chave), () => false);
  const alternar = (valor: boolean) => gravarSecao(chave, valor);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => alternar(!aberto)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"
      >
        <span className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▶</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate-900">{titulo}</span>
          {subtitulo && <span className="mt-0.5 block text-xs text-slate-500">{subtitulo}</span>}
        </span>
        {/* Com a sanfona fechada, o número-chave aparece aqui: dá para
            varrer os sete tópicos sem abrir nenhum. */}
        {resumo && (
          <span className="shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">{resumo}</span>
        )}
      </button>

      {aberto && (
        <div className="border-t border-slate-100 p-4">
          {filtro}
          <p className="mb-3 text-[11px] font-medium text-slate-400">Mostrando: {recorte}</p>
          <div className="space-y-4">{children}</div>
        </div>
      )}
    </section>
  );
}
