"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { iconePorTipo } from "@/lib/padroes-pilares";

type Padrao = {
  id: number;
  pilar: string;
  caminho: string;
  nome: string;
  tipo: string;
  arquivo_url: string;
};

export function PadraoItem({
  padrao,
  pastas,
  pilares,
  onAtualizar,
  onExcluir,
}: {
  padrao: Padrao;
  pastas: string[];
  pilares: string[];
  onAtualizar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();

  if (editando) {
    return (
      <form
        action={onAtualizar}
        className="space-y-3 bg-slate-50 p-4"
      >
        <input type="hidden" name="id" value={padrao.id} />
        <input type="hidden" name="pilar_origem" value={padrao.pilar} />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Nome
          </label>
          <input
            name="nome"
            defaultValue={padrao.nome}
            required
            className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Pilar
            </label>
            <select
              name="pilar"
              defaultValue={padrao.pilar}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
            >
              {pilares.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Pasta
            </label>
            <input
              name="caminho"
              defaultValue={padrao.caminho}
              list="pastas-existentes"
              placeholder="(sem pasta)"
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-primary focus:outline-none"
            />
            <datalist id="pastas-existentes">
              {pastas.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex gap-2">
          <BotaoEnviar
            textoEnviando="Salvando..."
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Salvar
          </BotaoEnviar>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3">
      <span className="text-xl">{iconePorTipo(padrao.tipo)}</span>
      <a
        href={padrao.arquivo_url}
        target="_blank"
        rel="noreferrer"
        className="flex-1 text-sm font-medium text-slate-800 hover:text-primary hover:underline"
      >
        {padrao.nome}
      </a>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Editar
      </button>
      <form
        action={onExcluir}
        onSubmit={aoExcluir({
          titulo: `Excluir "${padrao.nome}"?`,
          detalhe: "Essa ação não pode ser desfeita.",
        })}
      >
        <input type="hidden" name="id" value={padrao.id} />
        <input type="hidden" name="pilar" value={padrao.pilar} />
        <BotaoEnviar
          textoEnviando="Excluindo..."
          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Excluir
        </BotaoEnviar>
      </form>
    </div>
  );
}
