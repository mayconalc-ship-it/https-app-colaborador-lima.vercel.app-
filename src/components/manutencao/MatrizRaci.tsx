"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { LETRAS, SIGNIFICADO, problemasDaAtividade, proximaLetra, type Letra } from "@/lib/manutencao-raci";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type Papel = { id: string; nome: string; tipo: "area" | "fornecedor" };
type Atividade = { id: string; nome: string; critica: boolean };
type Acao = (fd: FormData) => Promise<ResultadoAcao>;

const COR: Record<Letra, string> = {
  R: "bg-primary text-white border-primary",
  A: "bg-red-600 text-white border-red-600",
  C: "bg-amber-100 text-amber-900 border-amber-300",
  I: "bg-slate-100 text-slate-700 border-slate-300",
};

const campo = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

/**
 * A MATRIZ RACI, de tocar: cada toque na célula troca a letra
 * (– → R → A → C → I → –) e já grava. A regra (um A e pelo menos um R por
 * linha) é conferida na hora, na própria tela.
 *
 * No celular cada atividade vira um cartão com as áreas uma embaixo da
 * outra; no computador, a tabela de sempre.
 */
export function MatrizRaci({
  papeis,
  atividades,
  letras,
  acoes,
}: {
  papeis: Papel[];
  atividades: Atividade[];
  letras: Record<string, Letra>;
  acoes: { definir: Acao; adicionarAtividade: Acao; adicionarPapel: Acao; remover: Acao };
}) {
  const toast = useToast();
  const router = useRouter();
  // O que foi tocado aqui e ainda pode não ter voltado do servidor.
  const [trocadas, setTrocadas] = useState<Record<string, Letra | null>>({});
  const chave = (a: string, p: string) => `${a}:${p}`;
  const letraDe = (a: string, p: string): Letra | null => {
    const k = chave(a, p);
    return k in trocadas ? trocadas[k] : (letras[k] ?? null);
  };

  async function tocar(atividadeId: string, papelId: string) {
    const k = chave(atividadeId, papelId);
    const antes = letraDe(atividadeId, papelId);
    const depois = proximaLetra(antes);
    setTrocadas((t) => ({ ...t, [k]: depois }));
    const fd = new FormData();
    fd.set("atividade_id", atividadeId);
    fd.set("papel_id", papelId);
    fd.set("letra", depois ?? "");
    let r: ResultadoAcao | undefined;
    try {
      r = await acoes.definir(fd);
    } catch {
      r = { ok: false, erro: "Sem conexão: a letra não foi salva." };
    }
    if (r && !r.ok) {
      setTrocadas((t) => ({ ...t, [k]: antes }));
      toast.erro(r.erro);
      return;
    }
    // O cartão de vigência lá em cima é do servidor: atualiza sem mexer na rolagem.
    router.refresh();
  }

  const problemasDe = (a: Atividade) => problemasDaAtividade(papeis.map((p) => letraDe(a.id, p.id)));

  return (
    <div>
      <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {LETRAS.map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${COR[l]}`}>{l}</span>
            {SIGNIFICADO[l]}
          </span>
        ))}
      </p>

      {/* ---- Celular: um cartão por atividade ---- */}
      <ul className="space-y-3 md:hidden">
        {atividades.map((a) => {
          const problemas = problemasDe(a);
          return (
            <li
              key={a.id}
              className={`rounded-2xl border bg-white p-3 shadow-sm ${problemas.length ? "border-red-300" : "border-slate-200"}`}
            >
              <NomeDaAtividade a={a} />
              <ul className="mt-2 divide-y divide-slate-100">
                {papeis.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-700">
                      {p.tipo === "fornecedor" && "🤝 "}
                      {p.nome}
                    </span>
                    <Celula letra={letraDe(a.id, p.id)} onClick={() => tocar(a.id, p.id)} rotulo={`${a.nome}, ${p.nome}`} />
                  </li>
                ))}
              </ul>
              <Problemas lista={problemas} />
              <TirarLinha id={a.id} nome={a.nome} remover={acoes.remover} />
            </li>
          );
        })}
      </ul>

      {/* ---- Computador: a tabela ---- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="p-2 text-left font-semibold">Atividade</th>
              {papeis.map((p) => (
                <th key={p.id} className="w-24 p-2 text-center align-bottom font-semibold">
                  <span className="block">
                    {p.tipo === "fornecedor" && "🤝 "}
                    {p.nome}
                  </span>
                  <BotaoNoLugar
                    acao={acoes.remover}
                    campos={{ id: p.id, o_que: "papel" }}
                    confirmacao={`Tirar a coluna "${p.nome}" da matriz?`}
                    rotuloConfirmar="Tirar"
                    perigo
                    className="mt-1 text-[10px] font-normal text-slate-400 hover:text-red-700"
                    title={`Tirar ${p.nome}`}
                  >
                    tirar
                  </BotaoNoLugar>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {atividades.map((a) => {
              const problemas = problemasDe(a);
              return (
                <tr key={a.id} className={problemas.length ? "bg-red-50/60" : ""}>
                  <td className="p-2">
                    <NomeDaAtividade a={a} />
                    <Problemas lista={problemas} />
                    <TirarLinha id={a.id} nome={a.nome} remover={acoes.remover} />
                  </td>
                  {papeis.map((p) => (
                    <td key={p.id} className="p-2 text-center">
                      <Celula letra={letraDe(a.id, p.id)} onClick={() => tocar(a.id, p.id)} rotulo={`${a.nome}, ${p.nome}`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <details className="rounded-2xl border border-dashed border-primary/40 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">➕ Incluir atividade</summary>
          <FormNoLugar acao={acoes.adicionarAtividade} limparAoSalvar fecharAoSalvar className="mt-3 space-y-2">
            <input name="nome" required maxLength={200} className={campo} placeholder="Ex.: Limpar as calhas antes da chuva" aria-label="Atividade" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="critica" className="h-4 w-4" /> Rotina de item crítico
            </label>
            <BotaoEnviar textoEnviando="Incluindo..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              Incluir
            </BotaoEnviar>
          </FormNoLugar>
        </details>
        <details className="rounded-2xl border border-dashed border-primary/40 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">➕ Incluir área ou fornecedor</summary>
          <FormNoLugar acao={acoes.adicionarPapel} limparAoSalvar fecharAoSalvar className="mt-3 space-y-2">
            <input name="nome" required maxLength={60} className={campo} placeholder="Ex.: Segurança patrimonial" aria-label="Área ou fornecedor" />
            <select name="tipo" defaultValue="area" className={campo} aria-label="Tipo">
              <option value="area">Área da unidade</option>
              <option value="fornecedor">Fornecedor externo</option>
            </select>
            <BotaoEnviar textoEnviando="Incluindo..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              Incluir
            </BotaoEnviar>
          </FormNoLugar>
        </details>
      </div>
    </div>
  );
}

function NomeDaAtividade({ a }: { a: Atividade }) {
  return (
    <p className="text-sm font-semibold leading-snug text-slate-900">
      {a.critica && <span className="mr-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">CRÍTICO</span>}
      {a.nome}
    </p>
  );
}

function Celula({ letra, onClick, rotulo }: { letra: Letra | null; onClick: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${rotulo}: ${letra ?? "vazio"}. Toque para trocar.`}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition active:scale-95 ${
        letra ? COR[letra] : "border-dashed border-slate-300 bg-white text-slate-300"
      }`}
    >
      {letra ?? "–"}
    </button>
  );
}

function Problemas({ lista }: { lista: string[] }) {
  if (lista.length === 0) return null;
  return <p className="mt-1.5 text-[11px] font-semibold text-red-700">⚠️ {lista.join(" · ")}</p>;
}

function TirarLinha({ id, nome, remover }: { id: string; nome: string; remover: Acao }) {
  return (
    <BotaoNoLugar
      acao={remover}
      campos={{ id, o_que: "atividade" }}
      confirmacao={`Tirar "${nome}" da matriz?`}
      rotuloConfirmar="Tirar"
      perigo
      className="mt-1 text-[11px] text-slate-400 hover:text-red-700"
    >
      tirar atividade
    </BotaoNoLugar>
  );
}
