"use client";

import { useState, useTransition } from "react";
import { responderTratativa } from "../actions";

/** 👍/👎 sobre o retorno da liderança -- só a opinião do motorista, não
 *  mexe em `tratativa_status`, que continua sendo do admin. */
export function RetornoLideranca({
  analiseId,
  aceitouInicial,
}: {
  analiseId: number;
  aceitouInicial: boolean | null;
}) {
  const [aceitou, setAceitou] = useState<boolean | null>(aceitouInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function responder(valor: boolean) {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await responderTratativa({ analiseId, aceitou: valor });
      if (resultado.ok) setAceitou(valor);
      else setErro(resultado.erro);
    });
  }

  if (aceitou !== null) {
    return (
      <p className="mt-3 text-xs font-medium text-slate-600">
        {aceitou ? "👍 Você aceitou este retorno." : "👎 Você marcou que não aceita este retorno."}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-slate-600">Você aceita este retorno?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => responder(true)}
          disabled={pendente}
          className="flex-1 rounded-xl border border-primary bg-white py-2 text-sm font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          👍 Aceitar
        </button>
        <button
          type="button"
          onClick={() => responder(false)}
          disabled={pendente}
          className="flex-1 rounded-xl border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          👎 Não aceitar
        </button>
      </div>
      {erro && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
