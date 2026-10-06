"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { ComMarcas } from "@/components/Icone";
import { corDaRevenda } from "@/lib/revenda-cor";
import { nomeCurtoRevenda } from "@/lib/revenda-sigla";
import { normalizar } from "@/lib/ficha-de-acesso";

/** Uma caixa da ficha: um módulo do app, ou uma ação de Modo Liderança. */
export type ItemDeAcesso = {
  /** Única na ficha: "app:<modulo>" ou "<modulo>:<acao>". */
  chave: string;
  campo: "app" | "permissao";
  /** O que vai no formulário: o módulo (app) ou "modulo:acao". */
  valor: string;
  modulo: string;
  /** Nulo nos módulos do app. */
  acao: string | null;
  rotulo: string;
  /** O nome genérico da ação, pequeno ao lado -- é o que a auditoria usa. */
  etiqueta?: string;
  nota?: string;
  /** Curto, para a lista do que muda na confirmação. */
  resumo: string;
  tem: boolean;
  /** Os perfis da pessoa que dão este acesso. */
  doPerfil: string[];
  /** Quem edita não tem esta permissão: a caixa trava e o servidor preserva. */
  foraDoAlcance: boolean;
};

export type BlocoDeAcesso = {
  id: string;
  titulo: string;
  nota?: string;
  itens: ItemDeAcesso[];
};

export type GrupoDeAcesso = { id: string; titulo: string; blocos: BlocoDeAcesso[] };

export type ParteDaFicha = {
  id: "app" | "lideranca";
  titulo: string;
  ajuda: string;
  grupos: GrupoDeAcesso[];
};

type Estado = "do-perfil" | "alcance" | "junto" | "livre";

/**
 * A FICHA DE ACESSO DE UMA PESSOA (05/10/2026).
 *
 * O dono, depois de várias melhorias: "até hoje acho ele muito complexo de
 * entender". A ficha antiga era uma sanfona por liderança com seis gavetas
 * abertas e trinta módulos de caixas em fila; colaborador nem tinha ficha.
 * Esta segue o desenho dos consoles de acesso atuais:
 *
 *   - UMA LINHA POR MÓDULO, fechada, com o resumo do que está liberado
 *     ("2 de 4", "Tudo", "Sem acesso") -- dá para varrer sem abrir nada;
 *   - A ORIGEM DE CADA ACESSO ao lado dele: "do perfil X" (travado -- quem
 *     manda é o perfil), "individual" (a exceção) ou "falta" (o perfil dá e
 *     ela não tem);
 *   - INTERRUPTOR em vez de caixinha, e busca por nome;
 *   - NADA GRAVA ATÉ O BOTÃO, que fica preso no rodapé com a cor e o nome
 *     da revenda e conta as alterações -- e a confirmação lista o que entra
 *     e o que sai, nome por nome.
 *
 * Coerência mantida: quem cria, edita ou exclui num módulo também abre a
 * tela dele -- o "ver" liga sozinho e trava, e o servidor faz o mesmo.
 */
export function FichaDeAcesso({
  action,
  pessoaId,
  pessoaNome,
  revenda,
  partes,
  travada,
  mandaLideranca,
}: {
  action: (formData: FormData) => void;
  pessoaId: string;
  pessoaNome: string;
  revenda: { id: string; nome: string; slug: string };
  partes: ParteDaFicha[];
  /** O motivo de não poder alterar, ou nulo. */
  travada: string | null;
  /** A seção de Modo Liderança vai no formulário (a pessoa é liderança). */
  mandaLideranca: boolean;
}) {
  const todos = useMemo(
    () => partes.flatMap((p) => p.grupos.flatMap((g) => g.blocos.flatMap((b) => b.itens))),
    [partes],
  );
  const inicial = useMemo(() => new Set(todos.filter((i) => i.tem).map((i) => i.chave)), [todos]);
  const [marcados, setMarcados] = useState<Set<string>>(inicial);
  const [busca, setBusca] = useState("");
  const [soLiberados, setSoLiberados] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const confirmarEnvio = useConfirmarEnvio();

  const cor = corDaRevenda(revenda.slug);
  const revendaCurta = nomeCurtoRevenda(revenda.nome);
  const primeiroNome = pessoaNome.split(" ")[0] || pessoaNome;

  // ---- o estado de cada caixa ----
  // As não-ver de cada módulo que estão ligadas: é o que liga o "ver".
  const outrasLigadas = useMemo(() => {
    const porModulo = new Set<string>();
    for (const i of todos) {
      if (i.campo !== "permissao" || i.acao === "ver") continue;
      if (ligadoBase(i, marcados)) porModulo.add(i.modulo);
    }
    return porModulo;
  }, [todos, marcados]);

  const estadoDe = (i: ItemDeAcesso): Estado => {
    if (i.tem && i.doPerfil.length > 0) return "do-perfil";
    if (i.foraDoAlcance) return "alcance";
    if (i.campo === "permissao" && i.acao === "ver" && outrasLigadas.has(i.modulo)) return "junto";
    return "livre";
  };
  const ligado = (i: ItemDeAcesso) => {
    const e = estadoDe(i);
    if (e === "junto") return true;
    return ligadoBase(i, marcados);
  };

  const entram = todos.filter((i) => !i.tem && ligado(i));
  const saem = todos.filter((i) => i.tem && !ligado(i));
  const alteracoes = entram.length + saem.length;
  const podeMexer = !travada;

  const alternar = (chave: string, valor: boolean) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (valor) novo.add(chave);
      else novo.delete(chave);
      return novo;
    });
  const emLote = (itens: ItemDeAcesso[], valor: boolean) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const i of itens) {
        if (estadoDe(i) !== "livre" && estadoDe(i) !== "junto") continue;
        if (valor) novo.add(i.chave);
        else novo.delete(i.chave);
      }
      return novo;
    });

  const termo = normalizar(busca.trim());
  const visivel = (b: BlocoDeAcesso, grupo: string) => {
    if (soLiberados && !b.itens.some((i) => ligado(i) || i.tem)) return false;
    if (!termo) return true;
    const texto = normalizar([grupo, b.titulo, b.nota ?? "", ...b.itens.map((i) => i.rotulo)].join(" "));
    return texto.includes(termo);
  };

  const lista = (itens: ItemDeAcesso[]) =>
    itens
      .slice(0, 6)
      .map((i) => i.resumo)
      .join("; ") + (itens.length > 6 ? ` e mais ${itens.length - 6}` : "");

  const pedido = {
    titulo: `Salvar ${alteracoes} alteração(ões) de ${primeiroNome} em ${revendaCurta}?`,
    detalhe: [entram.length > 0 ? `Entram: ${lista(entram)}.` : "", saem.length > 0 ? `Saem: ${lista(saem)}.` : ""]
      .filter(Boolean)
      .join(" "),
    confirmar: `Salvar em ${revendaCurta}`,
    perigo: saem.length > 0,
  };

  return (
    <form
      action={action}
      onSubmit={alteracoes > 0 ? confirmarEnvio(pedido) : (e) => e.preventDefault()}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={pessoaId} />
      <input type="hidden" name="revenda" value={revenda.id} />
      {mandaLideranca && <input type="hidden" name="secao_lideranca" value="1" />}

      {/* O QUE VAI PARA O SERVIDOR SAI DO ESTADO, NÃO DAS CAIXAS NA TELA.
          Módulo fechado, filtro de busca, "só o liberado": tudo isso
          esconde caixa, e esconder não pode virar desmarcar. As caixas
          visíveis não têm `name` -- são só o controle. */}
      {todos
        .filter((i) => i.campo === "app")
        .map((i) => (
          <input key={`u-${i.chave}`} type="hidden" name="app_universo" value={i.valor} />
        ))}
      {todos.filter(ligado).map((i) => (
        <input key={`v-${i.chave}`} type="hidden" name={i.campo} value={i.valor} />
      ))}

      {travada && (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">🔒 {travada}</p>
      )}

      {/* Busca e filtro: com quarenta módulos, achar um pelo nome é o que
          os consoles fazem -- rolar até ele é o que a tela antiga fazia. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          // Enter na busca não pode disparar o salvar.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Buscar acesso: escala, jornal, refugo…"
          aria-label="Buscar acesso"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm"
        />
        <div className="flex shrink-0 rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold">
          {[
            { valor: false, rotulo: "Tudo" },
            { valor: true, rotulo: "Só o liberado" },
          ].map((o) => (
            <button
              key={o.rotulo}
              type="button"
              onClick={() => setSoLiberados(o.valor)}
              aria-pressed={soLiberados === o.valor}
              className={`rounded-lg px-2.5 py-1.5 ${
                soLiberados === o.valor ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      {partes.map((parte) => {
        const grupos = parte.grupos
          .map((g) => ({ ...g, blocos: g.blocos.filter((b) => visivel(b, g.titulo)) }))
          .filter((g) => g.blocos.length > 0);
        const itensDaParte = parte.grupos.flatMap((g) => g.blocos.flatMap((b) => b.itens));
        const ligadosNaParte = itensDaParte.filter(ligado).length;
        return (
          <section key={parte.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">{parte.titulo}</h2>
                <p className="text-xs text-slate-500">{parte.ajuda}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                {ligadosNaParte} de {itensDaParte.length} liberados
              </span>
            </header>

            {grupos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                {termo || soLiberados ? "Nada encontrado com esse filtro." : "Nada para liberar aqui."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {grupos.map((g) => (
                  <div key={g.id} className="px-4 py-3">
                    {g.titulo && (
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <ComMarcas texto={g.titulo} />
                      </p>
                    )}
                    <ul className="space-y-1">
                      {g.blocos.map((b) => (
                        <Bloco
                          key={b.id}
                          bloco={b}
                          aberto={!!termo || abertos.has(b.id)}
                          alternarAberto={() =>
                            setAbertos((a) => {
                              const n = new Set(a);
                              if (n.has(b.id)) n.delete(b.id);
                              else n.add(b.id);
                              return n;
                            })
                          }
                          ligado={ligado}
                          estadoDe={estadoDe}
                          alternar={alternar}
                          emLote={emLote}
                          podeMexer={podeMexer}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* O RODAPÉ QUE SALVA, preso embaixo, com a cor e o nome da revenda.
          É o momento em que o ambiente importa: o botão diz onde grava. */}
      {podeMexer && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.15)] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor.ponto}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              {alteracoes === 0 ? (
                "Nenhuma alteração"
              ) : (
                <>
                  <strong className="text-slate-900">{alteracoes} alteração(ões)</strong>
                  {entram.length > 0 && <span className="ml-1.5 text-emerald-700">+{entram.length}</span>}
                  {saem.length > 0 && <span className="ml-1.5 text-red-600">−{saem.length}</span>}
                </>
              )}
            </p>
            {alteracoes > 0 && (
              <button
                type="button"
                onClick={() => setMarcados(new Set(inicial))}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Descartar
              </button>
            )}
            <BotaoEnviar
              disabled={alteracoes === 0}
              textoEnviando="Salvando..."
              className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${cor.forte} hover:brightness-110`}
            >
              Salvar em {revendaCurta}
            </BotaoEnviar>
          </div>
        </div>
      )}
    </form>
  );
}

function ligadoBase(i: ItemDeAcesso, marcados: Set<string>) {
  // O que vem do perfil, ou está fora do alcance de quem edita, fica como
  // está -- não importa o que se clique.
  if (i.tem && i.doPerfil.length > 0) return true;
  if (i.foraDoAlcance) return i.tem;
  return marcados.has(i.chave);
}

function Bloco({
  bloco,
  aberto,
  alternarAberto,
  ligado,
  estadoDe,
  alternar,
  emLote,
  podeMexer,
}: {
  bloco: BlocoDeAcesso;
  aberto: boolean;
  alternarAberto: () => void;
  ligado: (i: ItemDeAcesso) => boolean;
  estadoDe: (i: ItemDeAcesso) => Estado;
  alternar: (chave: string, valor: boolean) => void;
  emLote: (itens: ItemDeAcesso[], valor: boolean) => void;
  podeMexer: boolean;
}) {
  // Módulo de uma caixa só (todo módulo do app, e as análises): a linha É
  // o interruptor, sem abrir nada.
  if (bloco.itens.length === 1) {
    return (
      <li>
        <Linha
          item={bloco.itens[0]}
          titulo={bloco.titulo}
          nota={bloco.nota}
          ligado={ligado}
          estadoDe={estadoDe}
          alternar={alternar}
          podeMexer={podeMexer}
        />
      </li>
    );
  }

  const ativos = bloco.itens.filter(ligado).length;
  const mudou = bloco.itens.some((i) => i.tem !== ligado(i));
  const resumo = ativos === 0 ? "Sem acesso" : ativos === bloco.itens.length ? "Tudo" : `${ativos} de ${bloco.itens.length}`;

  return (
    <li className={`rounded-xl border ${aberto ? "border-slate-200 bg-slate-50/50" : "border-transparent"}`}>
      <button
        type="button"
        onClick={alternarAberto}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className={`text-xs text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▸</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
          <ComMarcas texto={bloco.titulo} />
        </span>
        {mudou && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">alterado</span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            ativos === 0
              ? "bg-slate-100 text-slate-400"
              : ativos === bloco.itens.length
                ? "bg-primary text-white"
                : "bg-primary-soft text-primary-dark"
          }`}
        >
          {resumo}
        </span>
      </button>
      {aberto && (
        <div className="px-2 pb-2">
          {bloco.nota && <p className="mb-1 pl-6 text-xs text-slate-500">{bloco.nota}</p>}
          <ul className="space-y-0.5 pl-4">
            {bloco.itens.map((i) => (
              <li key={i.chave}>
                <Linha item={i} ligado={ligado} estadoDe={estadoDe} alternar={alternar} podeMexer={podeMexer} />
              </li>
            ))}
          </ul>
          {podeMexer && (
            <div className="mt-1 flex gap-3 pl-6 text-xs font-semibold">
              <button type="button" onClick={() => emLote(bloco.itens, true)} className="text-primary hover:underline">
                Liberar tudo
              </button>
              <button type="button" onClick={() => emLote(bloco.itens, false)} className="text-slate-500 hover:underline">
                Tirar tudo
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Linha({
  item,
  titulo,
  nota,
  ligado,
  estadoDe,
  alternar,
  podeMexer,
}: {
  item: ItemDeAcesso;
  /** Quando a linha é o módulo inteiro, o título dele no lugar da ação. */
  titulo?: string;
  nota?: string;
  ligado: (i: ItemDeAcesso) => boolean;
  estadoDe: (i: ItemDeAcesso) => Estado;
  alternar: (chave: string, valor: boolean) => void;
  podeMexer: boolean;
}) {
  const estado = estadoDe(item);
  const ativo = ligado(item);
  const travado = !podeMexer || estado !== "livre";
  const entra = !item.tem && ativo;
  const sai = item.tem && !ativo;

  return (
    <label
      className={`flex items-start gap-3 rounded-lg px-2 py-2 ${travado ? "" : "cursor-pointer hover:bg-slate-50"}`}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          // Sem `name`: quem vai no formulário é o hidden do topo, que sai
          // do estado (ver FichaDeAcesso).
          checked={ativo}
          disabled={travado}
          onChange={(e) => alternar(item.chave, e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className={`text-sm leading-snug ${titulo ? "font-semibold text-slate-800" : "text-slate-700"}`}>
          <ComMarcas texto={titulo ?? item.rotulo} />
        </span>
        {item.etiqueta && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">{item.etiqueta}</span>
        )}
        {(nota ?? item.nota) && (
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{nota ?? item.nota}</span>
        )}
        <span className="mt-1 flex flex-wrap gap-1">
          {estado === "do-perfil" && (
            <Selo
              cor="bg-slate-100 text-slate-600"
              titulo="Vem do perfil. Para tirar, tire a pessoa do perfil (no topo da ficha) ou mude o perfil."
            >
              🎫 {item.doPerfil.join(" + ")}
            </Selo>
          )}
          {estado === "junto" && (
            <Selo cor="bg-slate-100 text-slate-500" titulo="Quem cria, edita ou exclui precisa abrir a tela.">
              liga junto com as outras ações
            </Selo>
          )}
          {estado === "alcance" && (
            <Selo cor="bg-slate-100 text-slate-500" titulo="Você não tem esta permissão nesta revenda.">
              🔒 fora do seu alcance
            </Selo>
          )}
          {estado === "livre" && item.tem && ativo && (
            <Selo cor="bg-amber-50 text-amber-800" titulo="Liberado à mão, fora de qualquer perfil.">
              individual
            </Selo>
          )}
          {!ativo && item.doPerfil.length > 0 && (
            <Selo cor="bg-rose-50 text-rose-700" titulo="O perfil dá este acesso, e a pessoa não tem.">
              falta · está no perfil {item.doPerfil.join(" + ")}
            </Selo>
          )}
          {entra && <Selo cor="bg-emerald-100 text-emerald-800">+ vai entrar</Selo>}
          {sai && <Selo cor="bg-red-100 text-red-700">− vai sair</Selo>}
        </span>
      </span>
    </label>
  );
}

function Selo({ cor, titulo, children }: { cor: string; titulo?: string; children: React.ReactNode }) {
  return (
    <span title={titulo} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${cor}`}>
      {children}
    </span>
  );
}
