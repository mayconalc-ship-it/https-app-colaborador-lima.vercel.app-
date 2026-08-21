"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComunicadoForm } from "@/components/ComunicadoForm";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import {
  editoria,
  ehFuturo,
  formatarDataCurta,
  formatarDataHora,
} from "@/lib/comunicados";

type Comunicado = {
  id: number;
  titulo: string;
  resumo: string | null;
  texto: string;
  categoria: string;
  destaque: boolean;
  data: string;
  imagem_url: string | null;
  publicar_em?: string | null;
  lembrete_em?: string | null;
  lembrete_areas?: string[] | null;
  lembrete_cargos?: string[] | null;
  lembrete_mensagem?: string | null;
  lembrete_enviado_em?: string | null;
};

export function ComunicadoItem({
  comunicado,
  onSalvar,
  onExcluir,
  cargosDisponiveis,
}: {
  comunicado: Comunicado;
  onSalvar: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
  cargosDisponiveis: string[];
}) {
  const [editando, setEditando] = useState(false);
  const aoExcluir = useConfirmarEnvio();
  const ed = editoria(comunicado.categoria);
  const naFila = ehFuturo(comunicado.publicar_em);

  if (editando) {
    return (
      <div className="bg-slate-50 p-4">
        <ComunicadoForm
          action={onSalvar}
          comunicado={comunicado}
          aoCancelar={() => setEditando(false)}
          cargosDisponiveis={cargosDisponiveis}
        />
      </div>
    );
  }

  return (
    // A faixa amarela na lateral existe porque a lista mistura o que já
    // saiu com o que ainda vai sair: sem ela, "publicados (60)" viraria
    // uma pilha em que o RH não distingue o jornal da fila.
    <div
      className={`flex items-start gap-3 p-3 ${
        naFila ? "border-l-4 border-amber-400 bg-amber-50/40" : ""
      }`}
    >
      {comunicado.imagem_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comunicado.imagem_url}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ed.cor}`}>
            {ed.emoji} {ed.rotulo}
          </span>
          {naFila && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
              ⏰ agendado · {formatarDataHora(comunicado.publicar_em!)}
            </span>
          )}
          {comunicado.destaque && (
            <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">
              capa
            </span>
          )}
          {comunicado.lembrete_em && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                comunicado.lembrete_enviado_em
                  ? "bg-slate-100 text-slate-500"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              🔔{" "}
              {comunicado.lembrete_enviado_em
                ? "disparado"
                : formatarDataHora(comunicado.lembrete_em)}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {formatarDataCurta(comunicado.data)}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-800">{comunicado.titulo}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Editar
        </button>
        <form
          action={onExcluir}
          onSubmit={aoExcluir({
            titulo: `Excluir "${comunicado.titulo}"?`,
            detalhe: "O comunicado sai do mural para todo mundo.",
          })}
        >
          <input type="hidden" name="id" value={comunicado.id} />
          <BotaoEnviar
            textoEnviando="Excluindo..."
            className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Excluir
          </BotaoEnviar>
        </form>
      </div>
    </div>
  );
}
