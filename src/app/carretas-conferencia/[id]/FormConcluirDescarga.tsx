"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { concluirDescarga } from "./actions";

export function FormConcluirDescarga({ atendimentoId }: { atendimentoId: string }) {
  const [temCarga, setTemCarga] = useState<"nao" | "sim">("nao");

  return (
    <form action={concluirDescarga} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <p className="text-sm font-bold text-slate-800">Vai ter carga além da descarga?</p>
      <div className="flex gap-3">
        {(["nao", "sim"] as const).map((v) => (
          <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="tem_carga"
              value={v}
              checked={temCarga === v}
              onChange={() => setTemCarga(v)}
              className="h-4 w-4"
            />
            {v === "sim" ? "Sim" : "Não, só descarga"}
          </label>
        ))}
      </div>

      <BotaoEnviar
        textoEnviando="Concluindo..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        {temCarga === "sim" ? "Concluir descarga e iniciar carga" : "Concluir descarga e finalizar"}
      </BotaoEnviar>
    </form>
  );
}
