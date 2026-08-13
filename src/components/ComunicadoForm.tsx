"use client";

import { useState } from "react";
import { EDITORIAS, formatarDataHora, lembreteParaLocal } from "@/lib/comunicados";

type Comunicado = {
  id: number;
  titulo: string;
  resumo: string | null;
  texto: string;
  categoria: string;
  destaque: boolean;
  data: string;
  imagem_url: string | null;
  lembrete_em?: string | null;
  lembrete_cargos?: string[] | null;
  lembrete_mensagem?: string | null;
  lembrete_enviado_em?: string | null;
};

export function ComunicadoForm({
  action,
  comunicado,
  aoCancelar,
  cargosDisponiveis,
}: {
  action: (formData: FormData) => void;
  comunicado?: Comunicado;
  aoCancelar?: () => void;
  cargosDisponiveis: string[];
}) {
  const [categoria, setCategoria] = useState(
    comunicado?.categoria ?? "geral",
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const cargosMarcados = new Set(comunicado?.lembrete_cargos ?? []);

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

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          🔔 Lembrete agendado{" "}
          <span className="font-normal text-slate-400">(opcional)</span>
        </summary>
        <div className="mt-3 space-y-3">
          {comunicado?.lembrete_enviado_em && (
            <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700">
              Já disparado em {formatarDataHora(comunicado.lembrete_enviado_em)}
              . Mudar a data/hora abaixo reabre o disparo.
            </p>
          )}

          <div>
            <label
              htmlFor="lembrete_em"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Disparar em
            </label>
            <input
              id="lembrete_em"
              name="lembrete_em"
              type="datetime-local"
              defaultValue={
                comunicado?.lembrete_em
                  ? lembreteParaLocal(comunicado.lembrete_em)
                  : ""
              }
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          {cargosDisponiveis.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">
                Só para estes cargos{" "}
                <span className="font-normal text-slate-400">
                  (nenhum marcado = todo mundo)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {cargosDisponiveis.map((cargo) => (
                  <label
                    key={cargo}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="lembrete_cargos"
                      value={cargo}
                      defaultChecked={cargosMarcados.has(cargo)}
                      className="h-4 w-4 rounded border-slate-300 text-primary"
                    />
                    {cargo}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="lembrete_mensagem"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Texto do lembrete{" "}
              <span className="font-normal text-slate-400">
                (vazio = usa o título)
              </span>
            </label>
            <input
              id="lembrete_mensagem"
              name="lembrete_mensagem"
              defaultValue={comunicado?.lembrete_mensagem ?? ""}
              placeholder="Ex: O treinamento é hoje às 14h, não esqueça!"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <p className="text-xs text-slate-400">
            O lembrete chega pelo sino e pelo push, separado da publicação.
            O disparo pode atrasar alguns minutos em relação à hora
            marcada.
          </p>
        </div>
      </details>

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
