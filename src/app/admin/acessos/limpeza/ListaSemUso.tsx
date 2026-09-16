"use client";

import { useState } from "react";

export type GrupoSemUso = {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  /** Nulo quando esta pessoa não pode ser alterada por quem está olhando. */
  travada: string | null;
  itens: { modulo: string; rotulo: string; emoji: string; liberadoEm: string; ultimoUso: string }[];
};

/**
 * A lista de liberações sem uso, com as caixas de retirar.
 *
 * Um botão só, no fim, para a tela toda -- e ele fica desligado enquanto
 * nada estiver marcado. A ação no servidor confere de novo cada linha.
 */
export function ListaSemUso({
  grupos,
  podeEditar,
  acao,
  revendaId,
}: {
  grupos: GrupoSemUso[];
  podeEditar: boolean;
  acao: (formData: FormData) => Promise<void>;
  revendaId: string;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const alternar = (chave: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  const chavesDaPessoa = (g: GrupoSemUso) => g.itens.map((i) => `${g.colaboradorId}:${i.modulo}`);
  const alternarPessoa = (g: GrupoSemUso) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      const chaves = chavesDaPessoa(g);
      const todas = chaves.every((c) => novo.has(c));
      for (const c of chaves) {
        if (todas) novo.delete(c);
        else novo.add(c);
      }
      return novo;
    });

  const editavel = (g: GrupoSemUso) => podeEditar && g.travada === null;

  return (
    <form action={acao} onSubmit={() => setEnviando(true)}>
      <input type="hidden" name="revenda" value={revendaId} />
      <ul className="space-y-3">
        {grupos.map((g) => {
          const todas = chavesDaPessoa(g).every((c) => marcados.has(c));
          return (
            <li key={g.colaboradorId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{g.nome}</p>
                  {g.cargo && <p className="text-xs text-slate-500">{g.cargo}</p>}
                </div>
                {editavel(g) && g.itens.length > 1 && (
                  <button
                    type="button"
                    onClick={() => alternarPessoa(g)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary hover:text-primary"
                  >
                    {todas ? "Desmarcar todos" : "Marcar todos"}
                  </button>
                )}
              </div>
              {g.travada && <p className="mt-1 text-xs text-amber-700">🔒 {g.travada}</p>}
              <ul className="mt-2 divide-y divide-slate-100">
                {g.itens.map((i) => {
                  const chave = `${g.colaboradorId}:${i.modulo}`;
                  return (
                    <li key={i.modulo}>
                      <label
                        className={`flex items-center gap-3 py-2 ${editavel(g) ? "cursor-pointer" : ""}`}
                      >
                        {editavel(g) && (
                          <input
                            type="checkbox"
                            name="marcado"
                            value={chave}
                            checked={marcados.has(chave)}
                            onChange={() => alternar(chave)}
                            className="h-5 w-5 shrink-0 accent-red-600"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800">
                            {i.emoji} {i.rotulo}
                          </span>
                          <span className="block text-xs text-slate-500">
                            Liberado em {i.liberadoEm} · último uso: {i.ultimoUso}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {podeEditar && (
        <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-slate-600">
            {marcados.size === 0 ? "Marque o que deve sair." : `${marcados.size} liberação(ões) marcada(s).`}
          </p>
          <button
            type="submit"
            disabled={marcados.size === 0 || enviando}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Retirando…" : "Retirar os marcados"}
          </button>
        </div>
      )}
    </form>
  );
}
