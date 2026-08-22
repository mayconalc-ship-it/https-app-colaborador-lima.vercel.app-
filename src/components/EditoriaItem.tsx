"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import { CORES_EDITORIA, type Editoria } from "@/lib/comunicados";

/**
 * Os campos que descrevem uma editoria: emoji, nome e cor da etiqueta.
 *
 * Vive num componente só porque o formulário de criar e o de editar são o
 * MESMO formulário -- e quando não eram, a paleta ganhou uma cor nova no
 * "criar" e ficou sem ela no "editar" por meses.
 */
export function CamposDaEditoria({
  rotuloInicial = "",
  emojiInicial = "📰",
  corInicial = "cinza",
}: {
  rotuloInicial?: string;
  emojiInicial?: string;
  corInicial?: string;
}) {
  const [cor, setCor] = useState(corInicial);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="w-20">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Emoji
          </label>
          <input
            name="emoji"
            defaultValue={emojiInicial}
            maxLength={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Nome da editoria
          </label>
          <input
            name="rotulo"
            defaultValue={rotuloInicial}
            required
            maxLength={40}
            placeholder="Saúde e Bem-estar"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Cor da etiqueta
        </label>
        {/* A cor é escolhida VENDO a etiqueta pronta, não pelo nome dela:
            "índigo" e "roxo" só se distinguem olhando. */}
        <input type="hidden" name="cor" value={cor} />
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CORES_EDITORIA).map(([chave, c]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setCor(chave)}
              aria-pressed={cor === chave}
              title={c.rotulo}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${c.classe} ${
                cor === chave
                  ? "ring-2 ring-primary ring-offset-1"
                  : "opacity-70"
              }`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Uma linha da lista de editorias, com edição no lugar.
 *
 * Fechada, ela mostra a etiqueta exatamente como o colaborador vai ver no
 * jornal -- é a única forma honesta de escolher cor e emoji.
 */
export function EditoriaItem({
  editoria,
  materias,
  primeira,
  ultima,
  onSalvar,
  onMover,
  onAlternar,
  onExcluir,
}: {
  editoria: Editoria & { ativa: boolean };
  /** Quantas matérias estão nesta editoria -- pesa na hora de excluir. */
  materias: number;
  primeira: boolean;
  ultima: boolean;
  onSalvar: (formData: FormData) => void;
  onMover: (formData: FormData) => void;
  onAlternar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();

  if (editando) {
    return (
      <form action={onSalvar} className="bg-slate-50 p-4">
        <input type="hidden" name="id" value={editoria.id} />
        <CamposDaEditoria
          rotuloInicial={editoria.rotulo}
          emojiInicial={editoria.emoji}
          corInicial={editoria.cor}
        />
        <div className="mt-3 flex gap-2">
          <BotaoEnviar
            textoEnviando="Salvando..."
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Salvar
          </BotaoEnviar>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 ${editoria.ativa ? "" : "bg-slate-50"}`}>
      <div className="flex shrink-0 flex-col">
        <form action={onMover}>
          <input type="hidden" name="id" value={editoria.id} />
          <input type="hidden" name="direcao" value="cima" />
          <button
            type="submit"
            disabled={primeira}
            aria-label={`Subir ${editoria.rotulo}`}
            className="px-1 text-slate-400 disabled:opacity-25"
          >
            ▲
          </button>
        </form>
        <form action={onMover}>
          <input type="hidden" name="id" value={editoria.id} />
          <input type="hidden" name="direcao" value="baixo" />
          <button
            type="submit"
            disabled={ultima}
            aria-label={`Descer ${editoria.rotulo}`}
            className="px-1 text-slate-400 disabled:opacity-25"
          >
            ▼
          </button>
        </form>
      </div>

      <div className="min-w-0 flex-1">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${editoria.classe} ${
            editoria.ativa ? "" : "opacity-50"
          }`}
        >
          {editoria.emoji} {editoria.rotulo}
        </span>
        <p className="mt-1 text-xs text-slate-400">
          {materias === 0
            ? "nenhuma matéria"
            : `${materias} matéria${materias === 1 ? "" : "s"}`}
          {editoria.ativa ? "" : " · desligada"}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Editar
        </button>

        <form action={onAlternar}>
          <input type="hidden" name="id" value={editoria.id} />
          <input type="hidden" name="ativa" value={String(editoria.ativa)} />
          <BotaoEnviar
            textoEnviando="..."
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {editoria.ativa ? "Desligar" : "Ligar"}
          </BotaoEnviar>
        </form>

        {/* "Geral" não tem botão de excluir: é para lá que vão as matérias
            de toda editoria excluída. Sem ela não haveria para onde ir. */}
        {editoria.id !== "geral" && (
          <form
            action={onExcluir}
            onSubmit={aoExcluir({
              titulo: `Excluir a editoria "${editoria.rotulo}"?`,
              detalhe:
                materias === 0
                  ? "Nenhuma matéria usa esta editoria."
                  : `${materias} matéria${materias === 1 ? "" : "s"} vão para a editoria Geral.`,
            })}
          >
            <input type="hidden" name="id" value={editoria.id} />
            <BotaoEnviar
              textoEnviando="Excluindo..."
              className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Excluir
            </BotaoEnviar>
          </form>
        )}
      </div>
    </div>
  );
}
