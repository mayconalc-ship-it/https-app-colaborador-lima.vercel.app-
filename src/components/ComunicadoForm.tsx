"use client";

import { useState } from "react";
import { EDITORIAS } from "@/lib/comunicados";

type Comunicado = {
  id: number;
  titulo: string;
  resumo: string | null;
  texto: string;
  categoria: string;
  destaque: boolean;
  data: string;
  imagem_url: string | null;
};

export function ComunicadoForm({
  action,
  comunicado,
  aoCancelar,
}: {
  action: (formData: FormData) => void;
  comunicado?: Comunicado;
  aoCancelar?: () => void;
}) {
  const [categoria, setCategoria] = useState(
    comunicado?.categoria ?? "geral",
  );
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4">
      {comunicado && <input type="hidden" name="id" value={comunicado.id} />}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Editoria
        </label>
        <div className="flex flex-wrap gap-2">
          {EDITORIAS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setCategoria(e.id)}
              className={`rounded-full border px-3 py-2 text-sm ${
                categoria === e.id
                  ? "border-primary bg-primary-soft font-semibold text-primary"
                  : "border-slate-200 text-slate-700"
              }`}
            >
              {e.emoji} {e.rotulo}
            </button>
          ))}
        </div>
        <input type="hidden" name="categoria" value={categoria} />
      </div>

      <div>
        <label
          htmlFor="titulo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          defaultValue={comunicado?.titulo}
          placeholder="Ex: Campanha de uso de EPI começa segunda"
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="resumo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Chamada <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="resumo"
          name="resumo"
          defaultValue={comunicado?.resumo ?? ""}
          placeholder="Uma frase curta que aparece na capa"
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="texto"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Conteúdo
        </label>
        <textarea
          id="texto"
          name="texto"
          required
          rows={7}
          defaultValue={comunicado?.texto}
          placeholder="Escreva a notícia. Pule linha para separar parágrafos."
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <label
            htmlFor="data"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Data da publicação
          </label>
          <input
            id="data"
            name="data"
            type="date"
            defaultValue={comunicado?.data ?? hoje}
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="imagem"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Foto {comunicado?.imagem_url && "(mantém a atual)"}
          </label>
          <input
            id="imagem"
            name="imagem"
            type="file"
            accept=".png,.jpg,.jpeg"
            className="w-full rounded-xl border border-slate-200 p-2 text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        <input
          type="checkbox"
          name="destaque"
          defaultChecked={comunicado?.destaque}
          className="h-5 w-5 accent-[#0b4da2]"
        />
        <span className="text-sm text-slate-700">
          <strong>Matéria de capa</strong> — aparece grande no topo do jornal
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          {comunicado ? "Salvar alterações" : "Publicar"}
        </button>
        {aoCancelar && (
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
