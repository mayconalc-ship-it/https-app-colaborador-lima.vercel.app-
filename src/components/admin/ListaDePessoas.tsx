"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizar } from "@/lib/ficha-de-acesso";

export type PessoaDaLista = {
  id: string;
  nome: string;
  // Sem CPF de propósito: a lista inteira vai para o navegador de quem
  // gerencia, e a busca por nome resolve sem espalhar documento.
  cargo: string | null;
  area: string | null;
  papel: "lideranca" | "colaborador";
  perfis: string[];
  /** Acessos fora de qualquer perfil da pessoa. */
  individuais: number;
  /** O que um perfil dela dá e ela não tem. */
  faltando: number;
  /** Quantos acessos tem nesta revenda (app + Modo Liderança). */
  acessos: number;
  outrasRevendas: string[];
  /** Por que esta ficha não se altera, quando não se altera. */
  travada: string | null;
};

type Filtro = "todos" | "lideranca" | "colaborador" | "sem-perfil" | "fora";

const FILTROS: { id: Filtro; rotulo: string; vale: (p: PessoaDaLista) => boolean }[] = [
  { id: "todos", rotulo: "Todos", vale: () => true },
  { id: "lideranca", rotulo: "Liderança", vale: (p) => p.papel === "lideranca" },
  { id: "colaborador", rotulo: "Colaborador", vale: (p) => p.papel === "colaborador" },
  { id: "sem-perfil", rotulo: "Sem perfil", vale: (p) => p.perfis.length === 0 },
  { id: "fora", rotulo: "Fora do perfil", vale: (p) => p.perfis.length > 0 && (p.individuais > 0 || p.faltando > 0) },
];

/**
 * A LISTA DE PESSOAS DA GESTÃO DE ACESSOS (05/10/2026).
 *
 * Era uma lista só de LIDERANÇAS, em sanfonas; os colaboradores -- a
 * maioria de quem se libera -- só existiam como linhas da grade de
 * módulos. Agora é todo mundo da revenda, com o que responde "precisa de
 * atenção?" sem abrir ninguém: o papel, os perfis, e quantos acessos
 * estão fora do perfil. A busca filtra enquanto se digita, como nos
 * diretórios de usuários dos consoles de acesso.
 */
export function ListaDePessoas({ pessoas }: { pessoas: PessoaDaLista[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const termo = normalizar(busca.trim());
  const contagem = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, pessoas.filter(f.vale).length])) as Record<Filtro, number>,
    [pessoas],
  );
  const regra = FILTROS.find((f) => f.id === filtro)!;
  const visiveis = pessoas.filter(
    (p) =>
      regra.vale(p) &&
      (!termo || normalizar([p.nome, p.cargo ?? "", p.area ?? "", ...p.perfis].join(" ")).includes(termo)),
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cargo, área ou perfil"
          aria-label="Buscar pessoa"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none sm:text-sm"
        />
        <div
          className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filtrar"
        >
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                filtro === f.id
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {f.rotulo} <span className={filtro === f.id ? "text-white/70" : "text-slate-400"}>{contagem[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">Ninguém encontrado.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visiveis.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/acessos/${p.id}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    p.papel === "lideranca" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {iniciais(p.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">{p.nome}</span>
                    {p.papel === "lideranca" && (
                      <span className="rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-900">
                        Liderança
                      </span>
                    )}
                    {p.travada && (
                      <span title={p.travada} className="text-xs">
                        🔒
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {[p.cargo, p.area].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.perfis.map((nome) => (
                      <span key={nome} className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
                        🎫 {nome}
                      </span>
                    ))}
                    {p.individuais > 0 && (
                      <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800">
                        {p.individuais} individual(is)
                      </span>
                    )}
                    {p.faltando > 0 && (
                      <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700">
                        faltam {p.faltando} do perfil
                      </span>
                    )}
                    {p.outrasRevendas.length > 0 && (
                      <span className="rounded-full bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-400">
                        também em {p.outrasRevendas.join(", ")}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-slate-700">{p.acessos}</span>
                  <span className="block text-[10px] text-slate-400">acessos</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-slate-300">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        {visiveis.length} de {pessoas.length} pessoa(s)
      </p>
    </div>
  );
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
