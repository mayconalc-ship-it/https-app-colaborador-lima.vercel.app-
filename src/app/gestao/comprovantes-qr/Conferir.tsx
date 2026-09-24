"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarConferencia } from "@/app/qr-contingencia/actions";
import {
  CONFERENCIA_OBS_MAX,
  MOTIVOS_DE_DIVERGENCIA,
  MOTIVOS_PARA_DESCONSIDERAR,
  digitosDoValor,
  formatarReais,
  lerValor,
  mostrarDigitosEmReais,
  validarConferencia,
  valorDosDigitos,
  type SituacaoConferencia,
} from "@/lib/qr-contingencia";

/** Um comprovante no livro do mapa -- já com as datas formatadas no servidor. */
export type LancamentoDoLivro = {
  id: string;
  dia: string | null; // "19/09" quando o filtro pega mais de um dia
  hora: string;
  codPdv: string;
  /** A razão social (base de clientes); fora da base, o nome do comprovante. */
  razaoSocial: string | null;
  /** O nome fantasia, só quando difere da razão social. */
  fantasia: string | null;
  clienteCidade: string | null;
  colaboradorNome: string | null; // só quando o mapa tem mais de uma pessoa
  valor: number | null;
  notas: string[];
  fotos: { id: string; url: string | null }[];
  observacao: string | null;
  avisos: string[]; // "cliente com mais de um comprovante…", "feito sem internet…"
  edicoes: string[]; // "Editado às 10:32 por João · valor R$ 80,00 → R$ 85,00"
  situacao: SituacaoConferencia | null;
  valorExtrato: number | null;
  motivo: string | null;
  conferidoPor: string | null; // "Ana · 19/09 17:00"
};

const reais = (v: number) => formatarReais(v);

/**
 * O LIVRO DO MAPA -- a conciliação "de contabilidade" (pedido do dono,
 * 19/09/2026). Cada comprovante é um lançamento com carimbo: CONFERIDO
 * (bate com o extrato), DIVERGENTE (o valor que caiu no banco, a diferença
 * e o motivo) ou a conferir. Marca-se em lote; no pé, o fechamento do
 * mapa, com o carimbo de MAPA FECHADO quando tudo bateu.
 */
export function LivroDoMapa({
  titulo,
  subtitulo,
  aberto,
  lancamentos,
  totalDoMapa,
  qtdNoMapa,
  podeConferir,
  textoResumo,
}: {
  titulo: string;
  subtitulo: string;
  aberto: boolean;
  lancamentos: LancamentoDoLivro[];
  totalDoMapa: number;
  qtdNoMapa: number;
  podeConferir: boolean;
  textoResumo: string;
}) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [divergindo, setDivergindo] = useState<string | null>(null);
  // Boleto no meio dos PIX (22/09/2026): sai da conta, sem apagar.
  const [desconsiderando, setDesconsiderando] = useState<string | null>(null);

  const pendentes = lancamentos.filter((l) => !l.situacao);
  const conferidos = lancamentos.filter((l) => l.situacao === "conferido");
  const divergentes = lancamentos.filter((l) => l.situacao === "divergente");
  const desconsiderados = lancamentos.filter((l) => l.situacao === "desconsiderado");
  const soma = (ls: LancamentoDoLivro[]) => ls.reduce((s, l) => s + (l.valor ?? 0), 0);
  const diferenca = divergentes.reduce((s, l) => s + ((l.valorExtrato ?? 0) - (l.valor ?? 0)), 0);
  const fechado = lancamentos.length > 0 && pendentes.length === 0 && divergentes.length === 0;
  const somaMarcados = soma(lancamentos.filter((l) => marcados.has(l.id)));

  function salvar(ids: string[], situacao: SituacaoConferencia | null, extra?: { valorExtrato?: string; motivo: string }) {
    setErro(null);
    iniciar(async () => {
      // Erro de servidor deixava o botão em "Salvando..." para sempre e a
      // conferência parecia não valer (24/09/2026).
      try {
        const r = await registrarConferencia({ ids, situacao, ...extra });
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        setMarcados(new Set());
        setDivergindo(null);
        setDesconsiderando(null);
        router.refresh();
      } catch {
        setErro(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "Sem internet. A conferência não foi salva — tente de novo quando o sinal voltar."
            : "Não consegui salvar. Atualize a página (F5) e tente de novo.",
        );
      }
    });
  }

  function alternar(id: string) {
    setMarcados((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const todosMarcados = pendentes.length > 0 && pendentes.every((l) => marcados.has(l.id));

  return (
    <details open={aberto} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold tabular-nums text-slate-900">{titulo}</span>
          <span className="block truncate text-xs text-slate-500">{subtitulo}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-lg font-bold tabular-nums text-slate-900">
            {reais(totalDoMapa - soma(desconsiderados))}
          </span>
          <SituacaoDoMapa
            fechado={fechado}
            divergentes={divergentes.length}
            feitos={conferidos.length + divergentes.length + desconsiderados.length}
            total={qtdNoMapa}
          />
        </span>
        <span className="shrink-0 text-sm text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>

      {/* Cabeçalho do livro */}
      <div className="flex items-center gap-3 border-y border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {podeConferir && (
          <input
            type="checkbox"
            aria-label="Marcar todos os pendentes"
            checked={todosMarcados}
            disabled={pendentes.length === 0 || salvando}
            onChange={() => setMarcados(todosMarcados ? new Set() : new Set(pendentes.map((l) => l.id)))}
            className="h-4 w-4 accent-emerald-600"
          />
        )}
        <span className="w-11 shrink-0">Hora</span>
        <span className="flex-1">Cliente</span>
        <span className="shrink-0 text-right">Valor · Situação</span>
      </div>

      <ul className="divide-y divide-dashed divide-slate-200">
        {lancamentos.map((l) => (
          <li
            key={l.id}
            className={`flex gap-3 px-4 py-3 ${
              l.situacao === "divergente"
                ? "bg-red-50/50"
                : l.situacao === "conferido"
                  ? "bg-emerald-50/30"
                  : l.situacao === "desconsiderado"
                    ? "bg-slate-50 text-slate-400"
                    : ""
            }`}
          >
            {podeConferir && (
              <input
                type="checkbox"
                aria-label={`Marcar ${l.codPdv} ${l.razaoSocial ?? ""}`.trim()}
                checked={marcados.has(l.id)}
                disabled={Boolean(l.situacao) || salvando}
                onChange={() => alternar(l.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-emerald-600 disabled:opacity-20"
              />
            )}
            <span className="w-11 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-slate-500">
              {l.dia && <span className="block text-[10px] text-slate-400">{l.dia}</span>}
              {l.hora}
            </span>

            <div className="min-w-0 flex-1">
              {/* No celular, o nome ganha a largura toda e o valor desce
                  para a linha de baixo -- razão social comprida não corta. */}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1 basis-56">
                  {/* CÓDIGO, RAZÃO SOCIAL e, embaixo e menor, o FANTASIA
                      (pedido do dono, 21/09/2026). */}
                  <p className="text-sm leading-snug [overflow-wrap:normal]">
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 font-mono font-bold tabular-nums text-slate-700">
                      {l.codPdv}
                    </span>
                    <span className="font-semibold uppercase text-slate-900">{l.razaoSocial ?? "Cliente sem cadastro"}</span>
                  </p>
                  {l.fantasia && <p className="mt-0.5 text-xs text-slate-600">{l.fantasia}</p>}
                  {(l.clienteCidade || l.colaboradorNome) && (
                    <p className="truncate text-[11px] text-slate-400">
                      {[l.clienteCidade, l.colaboradorNome].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {l.notas.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {l.notas.map((n) => (
                        <span
                          key={n}
                          className="rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold tabular-nums text-slate-700"
                        >
                          NF {n}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="ml-auto shrink-0 text-right">
                  <p
                    className={`font-mono text-base font-bold tabular-nums ${
                      l.situacao === "desconsiderado" ? "text-slate-400 line-through" : "text-slate-900"
                    }`}
                  >
                    {l.valor == null ? <span className="font-sans text-sm font-medium text-amber-700">sem valor</span> : reais(l.valor)}
                  </p>
                  {l.situacao === "divergente" && l.valorExtrato != null && (
                    <p className="font-mono text-[11px] tabular-nums text-red-700">
                      extrato {reais(l.valorExtrato)}
                      <br />
                      dif. {reais(l.valorExtrato - (l.valor ?? 0))}
                    </p>
                  )}
                </div>
              </div>

              {(l.avisos.length > 0 || l.observacao) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {l.avisos.map((a) => (
                    <span key={a} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                      {a}
                    </span>
                  ))}
                  {l.observacao && <span className="text-xs italic text-slate-600">“{l.observacao}”</span>}
                </div>
              )}
              {l.edicoes.map((e) => (
                <p key={e} className="mt-1 w-fit rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  ✏️ {e}
                </p>
              ))}

              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto">
                  {l.fotos.map((f, i) =>
                    f.url ? (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir a foto ${i + 1}`}
                        className="shrink-0 overflow-hidden rounded-lg border border-slate-200 hover:border-primary"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                        <img
                          src={f.url}
                          alt={`Comprovante, foto ${i + 1}`}
                          // PREGUIÇOSA de propósito (24/09/2026): a semana
                          // inteira dá ~750 fotos, e baixar todas de uma vez
                          // travava o navegador do financeiro. Assim só baixa
                          // a do mapa que a pessoa abriu e está olhando.
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-11 object-cover"
                        />
                      </a>
                    ) : (
                      <span key={f.id} className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                        sem foto
                      </span>
                    ),
                  )}
                </div>
                <div className="ml-auto shrink-0 text-right">
                  {l.situacao ? (
                    <div className="flex flex-col items-end gap-1">
                      <Carimbo tipo={l.situacao} />
                      {l.motivo && (
                        <p className={`max-w-[12rem] text-[11px] ${l.situacao === "desconsiderado" ? "text-slate-500" : "text-red-700"}`}>
                          {l.motivo}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">
                        {l.conferidoPor}
                        {podeConferir && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              disabled={salvando}
                              onClick={() => {
                                if (confirm("Desfazer a conciliação deste comprovante?")) salvar([l.id], null);
                              }}
                              className="underline hover:text-slate-600"
                            >
                              desfazer
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                  ) : podeConferir && divergindo !== l.id && desconsiderando !== l.id ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => salvar([l.id], "conferido")}
                        className="rounded-lg border border-emerald-600 bg-white px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        ✓ Bate
                      </button>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => setDivergindo(l.id)}
                        className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        ≠ Diverge
                      </button>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => setDesconsiderando(l.id)}
                        title="Tirar da conta do mapa (boleto, duplicado...) sem apagar"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        ⊘ Desconsiderar
                      </button>
                    </div>
                  ) : !podeConferir ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">a conferir</span>
                  ) : null}
                </div>
              </div>

              {desconsiderando === l.id && (
                <FormDesconsiderar
                  salvando={salvando}
                  aoCancelar={() => setDesconsiderando(null)}
                  aoSalvar={(motivo) => salvar([l.id], "desconsiderado", { motivo })}
                />
              )}
              {divergindo === l.id && (
                <FormDivergencia
                  valorComprovante={l.valor}
                  salvando={salvando}
                  aoCancelar={() => setDivergindo(null)}
                  aoSalvar={(valorExtrato, motivo) => salvar([l.id], "divergente", { valorExtrato, motivo })}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Marcados em lote */}
      {podeConferir && marcados.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <p className="text-sm text-emerald-900">
            <strong>{marcados.size}</strong> marcado{marcados.size === 1 ? "" : "s"} ·{" "}
            <span className="font-mono font-bold tabular-nums">{reais(somaMarcados)}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMarcados(new Set())}
              className="rounded-lg px-3 py-2 text-sm text-emerald-900 underline"
            >
              Limpar
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvar([...marcados], "conferido")}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "✓ Conferir marcados"}
            </button>
          </div>
        </div>
      )}
      {erro && <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</p>}

      {/* ---- FECHAMENTO DO MAPA ---- */}
      <div className="relative border-t border-slate-200 bg-slate-50/70 px-4 py-4">
        <div className="max-w-sm space-y-1 font-mono text-[13px] tabular-nums">
          <Linha rotulo="Comprovantes" valor={reais(totalDoMapa)} qtd={qtdNoMapa} />
          {desconsiderados.length > 0 && (
            <Linha rotulo="(−) Desconsiderado" valor={reais(soma(desconsiderados))} qtd={desconsiderados.length} cor="text-slate-500" />
          )}
          <Linha rotulo="(−) Conferido" valor={reais(soma(conferidos))} qtd={conferidos.length} cor="text-emerald-700" />
          <Linha rotulo="(−) Divergente" valor={reais(soma(divergentes))} qtd={divergentes.length} cor="text-red-700" />
          <div className="border-t-[3px] border-double border-slate-400 pt-1">
            <Linha rotulo="(=) A conferir" valor={reais(soma(pendentes))} qtd={pendentes.length} forte />
          </div>
          {divergentes.length > 0 && (
            <p className="pt-1 text-[12px] text-red-700">
              Diferença no extrato: <strong>{reais(diferenca)}</strong>
            </p>
          )}
        </div>
        {(fechado || divergentes.length > 0) && (
          <div className="pointer-events-none absolute right-4 top-3 hidden sm:block">
            <span
              className={`inline-block -rotate-6 rounded-md border-[3px] px-3 py-1 font-mono text-sm font-black uppercase tracking-[0.2em] opacity-80 ${
                fechado ? "border-emerald-600 text-emerald-700" : "border-red-600 text-red-700"
              }`}
            >
              {fechado ? "Mapa fechado" : "Com divergência"}
            </span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <CopiarResumo texto={textoResumo} />
        </div>
      </div>
    </details>
  );
}

/** Linha do fechamento, com pontilhado até o valor -- como no livro-razão. */
function Linha({
  rotulo,
  valor,
  qtd,
  cor = "text-slate-700",
  forte = false,
}: {
  rotulo: string;
  valor: string;
  qtd: number;
  cor?: string;
  forte?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${cor} ${forte ? "font-bold" : ""}`}>
      <span className="shrink-0">{rotulo}</span>
      <span className="shrink-0 text-[11px] text-slate-400">({qtd})</span>
      <span className="mb-1 flex-1 border-b border-dotted border-slate-300" aria-hidden="true" />
      <span className="shrink-0">{valor}</span>
    </div>
  );
}

function Carimbo({ tipo }: { tipo: SituacaoConferencia }) {
  const estilo = {
    conferido: "border-emerald-600 text-emerald-700",
    divergente: "border-red-600 text-red-700",
    desconsiderado: "border-slate-400 text-slate-500",
  }[tipo];
  const texto = { conferido: "✓ Conferido", divergente: "≠ Divergente", desconsiderado: "⊘ Desconsiderado" }[tipo];
  return (
    <span
      className={`inline-block -rotate-3 rounded border-2 px-2 py-0.5 font-mono text-[11px] font-black uppercase tracking-[0.18em] ${estilo}`}
    >
      {texto}
    </span>
  );
}

/** Tirar da conta do mapa -- boleto no meio dos PIX, duplicado... -- com o motivo. */
function FormDesconsiderar({
  salvando,
  aoCancelar,
  aoSalvar,
}: {
  salvando: boolean;
  aoCancelar: () => void;
  aoSalvar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  // A MESMA regra do servidor (registrarConferencia).
  const problema = validarConferencia({ qtd: 1, situacao: "desconsiderado", valorExtrato: null, motivo });
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-300 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Desconsiderar da conta do mapa</p>
      <p className="text-xs text-slate-500">
        O comprovante continua gravado e aparece riscado no livro, mas sai do total de PIX e não trava o fechamento.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_PARA_DESCONSIDERAR.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              motivo === m ? "border-slate-600 bg-slate-100 font-semibold text-slate-800" : "border-slate-300 text-slate-600 hover:border-slate-500"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={CONFERENCIA_OBS_MAX}
        placeholder="Ou escreva o motivo"
        aria-label="Motivo para desconsiderar"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={Boolean(problema) || salvando}
          onClick={() => aoSalvar(motivo)}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {salvando ? "Salvando..." : "⊘ Desconsiderar"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SituacaoDoMapa({
  fechado,
  divergentes,
  feitos,
  total,
}: {
  fechado: boolean;
  divergentes: number;
  feitos: number;
  total: number;
}) {
  const base = "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (divergentes > 0) return <span className={`${base} bg-red-100 text-red-800`}>≠ {divergentes} divergente{divergentes === 1 ? "" : "s"}</span>;
  if (fechado) return <span className={`${base} bg-emerald-100 text-emerald-800`}>✓ Fechado</span>;
  if (feitos === 0) return <span className={`${base} bg-slate-100 text-slate-600`}>A conferir</span>;
  return <span className={`${base} bg-amber-100 tabular-nums text-amber-800`}>{feitos} de {total}</span>;
}

/** O valor que caiu no extrato e o motivo -- a divergência. */
function FormDivergencia({
  valorComprovante,
  salvando,
  aoCancelar,
  aoSalvar,
}: {
  valorComprovante: number | null;
  salvando: boolean;
  aoCancelar: () => void;
  aoSalvar: (valorExtrato: string, motivo: string) => void;
}) {
  const [digitos, setDigitos] = useState("");
  const [tocado, setTocado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const valorExtrato = valorDosDigitos(digitos) || (tocado ? "0,00" : "");
  // A MESMA regra do servidor (registrarConferencia).
  const problema = validarConferencia({ qtd: 1, situacao: "divergente", valorExtrato: lerValor(valorExtrato), motivo });
  const numero = lerValor(valorExtrato);
  const dif = numero != null && !Number.isNaN(numero) ? numero - (valorComprovante ?? 0) : null;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-red-700">Registrar divergência</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Valor no extrato (0 se não caiu)</span>
          <input
            value={mostrarDigitosEmReais(digitos)}
            onChange={(e) => {
              setTocado(true);
              setDigitos(digitosDoValor(e.target.value));
            }}
            inputMode="numeric"
            aria-label="Valor que caiu no extrato"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right font-mono tabular-nums focus:border-red-400 focus:outline-none"
          />
        </label>
        <div className="self-end pb-2 font-mono text-xs tabular-nums text-slate-600">
          Comprovante {formatarReais(valorComprovante)}
          {dif !== null && tocado && (
            <span className={`block font-bold ${dif === 0 ? "text-slate-500" : "text-red-700"}`}>Diferença {formatarReais(dif)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_DE_DIVERGENCIA.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              motivo === m ? "border-red-500 bg-red-50 font-semibold text-red-800" : "border-slate-300 text-slate-600 hover:border-red-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={CONFERENCIA_OBS_MAX}
        placeholder="Ou escreva o motivo"
        aria-label="Motivo da divergência"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
      />
      {tocado && problema && <p className="text-xs text-red-600">{problema}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={Boolean(problema) || salvando}
          onClick={() => aoSalvar(valorExtrato, motivo)}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
        >
          {salvando ? "Salvando..." : "Registrar divergência"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Copia o resumo do mapa (para colar no WhatsApp ou na planilha do financeiro). */
export function CopiarResumo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-primary"
    >
      {copiado ? "✅ Resumo copiado" : "📋 Copiar resumo"}
    </button>
  );
}
