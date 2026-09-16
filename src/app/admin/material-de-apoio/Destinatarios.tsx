"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { salvarDestinatarios } from "./actions";

type Pessoa = { id: string; nome: string; cargo: string | null };

/**
 * Quem recebe o alerta de compra. A lista inteira com busca, os marcados
 * no topo, e um Salvar só no fim.
 *
 * Os marcados que a busca esconde continuam indo no envio (campos ocultos):
 * filtrar a lista não pode desmarcar ninguém sem a pessoa ver.
 */
export function Destinatarios({
  pessoas,
  marcados,
  acao = salvarDestinatarios,
  rotuloDoBotao = "Salvar quem recebe",
  exigirAlguem = null,
  children,
}: {
  pessoas: Pessoa[];
  marcados: string[];
  /** Serve às duas listas da tela: o alerta de compra e o lembrete de contagem. */
  acao?: (formData: FormData) => Promise<void>;
  rotuloDoBotao?: string;
  /** Com ninguém marcado, trava o Salvar e diz o porquê (o servidor confere igual). */
  exigirAlguem?: string | null;
  /** Campos que vão no MESMO Salvar, acima da lista (horário, liga/desliga). */
  children?: React.ReactNode;
}) {
  const [selecionados, setSelecionados] = useState(() => new Set(marcados));
  const [busca, setBusca] = useState("");

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visiveis = useMemo(() => {
    const t = norm(busca.trim());
    const filtradas = t ? pessoas.filter((p) => norm(`${p.nome} ${p.cargo ?? ""}`).includes(t)) : pessoas;
    return [...filtradas].sort(
      (a, b) => Number(selecionados.has(b.id)) - Number(selecionados.has(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"),
    );
    // A ordem é a do momento em que a lista abre/filtra; reordenar a cada
    // clique faria a linha fugir do dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, busca]);
  const escondidos = [...selecionados].filter((id) => !visiveis.some((p) => p.id === id));

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <form action={acao} className="space-y-3">
      {children}
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou cargo"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
      />
      {escondidos.map((id) => (
        <input key={id} type="hidden" name="colaborador_id" value={id} />
      ))}
      <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        {visiveis.map((p) => (
          <li key={p.id}>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
                selecionados.has(p.id) ? "bg-primary-soft" : "hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                name="colaborador_id"
                value={p.id}
                checked={selecionados.has(p.id)}
                onChange={() => alternar(p.id)}
                className="h-4 w-4"
              />
              <span className="min-w-0 text-sm">
                <span className="font-medium text-slate-800">{p.nome}</span>
                {p.cargo && <span className="text-xs text-slate-500"> · {p.cargo}</span>}
              </span>
            </label>
          </li>
        ))}
        {visiveis.length === 0 && <li className="p-2 text-sm text-slate-500">Ninguém encontrado.</li>}
      </ul>
      {exigirAlguem && selecionados.size === 0 && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{exigirAlguem}</p>
      )}
      <BotaoEnviar
        disabled={Boolean(exigirAlguem) && selecionados.size === 0}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {rotuloDoBotao} ({selecionados.size})
      </BotaoEnviar>
    </form>
  );
}
