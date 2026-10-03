"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormNoLugar } from "@/components/FormNoLugar";
import { validarConfigQr } from "@/lib/qr-contingencia";
import { salvarConfigQr } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Um Salvar para a tela toda; trava com a mesma regra do servidor.
 *
 * SEM QR (03/10/2026, pedido do dono): o pagamento é pela chave CNPJ, que o
 * cliente digita no app do banco. A imagem do QR e o copia e cola (o mesmo
 * QR em texto) saíram do cadastro -- os dois geravam tarifa na conta.
 */
export function FormConfigQr({
  inicial,
}: {
  inicial: { favorecido: string; cnpj: string; instrucoes: string };
}) {
  const [favorecido, setFavorecido] = useState(inicial.favorecido);
  const [cnpj, setCnpj] = useState(inicial.cnpj);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);

  const problema = validarConfigQr({
    favorecido: favorecido.trim(),
    cnpj: cnpj.trim(),
    instrucoes: instrucoes.trim(),
  });

  return (
    <FormNoLugar acao={salvarConfigQr} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block">
        <span className={rotulo}>CNPJ (a chave PIX que o cliente digita)</span>
        <input name="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" className={campo} />
      </label>
      <label className="block">
        <span className={rotulo}>Favorecido (nome que aparece no PIX)</span>
        <input name="favorecido" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} maxLength={120} className={campo} />
      </label>
      <label className="block">
        <span className={rotulo}>Instruções para o motorista (opcional)</span>
        <textarea
          name="instrucoes"
          value={instrucoes}
          onChange={(e) => setInstrucoes(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ex.: confira o nome do favorecido no celular do cliente antes de ele confirmar."
          className={campo}
        />
      </label>
      {problema && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{problema}</p>}
      <BotaoEnviar
        disabled={Boolean(problema)}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Salvar a chave PIX
      </BotaoEnviar>
    </FormNoLugar>
  );
}
