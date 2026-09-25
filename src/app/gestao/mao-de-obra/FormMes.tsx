"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  MES_VAZIO,
  contaArmazem,
  contaDistribuicao,
  formatarNumero,
  validarMes,
  type ConfigMaoDeObra,
  type MesMaoDeObra,
} from "@/lib/mao-de-obra";
import { salvarMes } from "./actions";

type Campo = { id: keyof MesMaoDeObra; rotulo: string; ajuda?: string; passo?: string };

const DISTRIBUICAO: Campo[] = [
  { id: "volume_ppr", rotulo: "Volume PPR (HL)", ajuda: "O volume do plano — move o armazém." },
  { id: "volume_negociado", rotulo: "Volume negociado (HL)", ajuda: "O volume combinado — move a frota." },
  { id: "marketplace", rotulo: "Marketplace (R$)", ajuda: "Só acompanhamento." },
  { id: "dias_totais", rotulo: "Dias de operação (dia TT)" },
  { id: "sabados", rotulo: "Sábados no mês" },
  { id: "volume_entrega_sabado", rotulo: "Volume por sábado (HL)" },
  { id: "media_carro_hl", rotulo: "Média por carro (HL)" },
  { id: "frota_long_dist", rotulo: "Frota long distance" },
  { id: "frota_reserva", rotulo: "Frota reserva" },
  { id: "frota_spot", rotulo: "Frota SPOT" },
  { id: "frota_fixa_total", rotulo: "Frota fixa que temos", ajuda: "Só para comparar a ocupação." },
  { id: "puxadores", rotulo: "Motoristas puxadores" },
];

const ARMAZEM: Campo[] = [
  { id: "operador_tarde", rotulo: "Operadores — tarde" },
  { id: "operador_reserva", rotulo: "Operadores — reserva/ferista" },
  { id: "manobristas", rotulo: "Manobristas" },
  { id: "ajudante_noite", rotulo: "Ajudantes — noite" },
  { id: "ajudante_manha", rotulo: "Ajudantes — manhã" },
  { id: "ajudante_tarde", rotulo: "Ajudantes — tarde" },
  { id: "ajudante_reserva", rotulo: "Ajudantes — reserva/ferista" },
  { id: "ajudante_extra", rotulo: "Ajudantes — extras" },
  { id: "conferente_noite", rotulo: "Conferentes — noite" },
  { id: "conferente_manha", rotulo: "Conferentes — manhã" },
  { id: "conferente_tarde", rotulo: "Conferentes — tarde" },
];

const ACOMPANHAMENTO: Campo[] = [
  { id: "volume_realizado", rotulo: "Volume realizado (HL)", ajuda: "Preencha no fim do mês: é ele que dá a dispersão." },
];

/**
 * A GRADE DO MÊS -- tudo o que a liderança digita, com UM Salvar no fim.
 *
 * A conta aparece enquanto se digita: o simulador só serve se a pessoa vê
 * o efeito de mudar o volume antes de salvar. As mesmas funções do
 * servidor (contaDistribuicao/contaArmazem/validarMes).
 */
export function FormMes({
  competencia,
  mes,
  config,
}: {
  competencia: string;
  mes: MesMaoDeObra | null;
  config: ConfigMaoDeObra;
}) {
  const inicial = useMemo(() => {
    const base: Record<string, string> = {};
    for (const chave of Object.keys(MES_VAZIO)) {
      if (chave === "competencia" || chave === "observacao") continue;
      const valor = mes ? (mes[chave as keyof MesMaoDeObra] as number | null) : null;
      base[chave] = valor == null ? "" : String(valor);
    }
    return base;
  }, [mes]);

  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [observacao, setObservacao] = useState(mes?.observacao ?? "");

  const previa = useMemo(() => {
    const m: MesMaoDeObra = { ...MES_VAZIO, competencia };
    for (const chave of Object.keys(valores)) {
      const bruto = valores[chave].trim().replace(/\./g, "").replace(",", ".");
      (m[chave as keyof MesMaoDeObra] as number | null) = bruto === "" ? null : Number(bruto);
    }
    return { dist: contaDistribuicao(m), arm: contaArmazem(m, config), problema: validarMes(m) };
  }, [valores, competencia, config]);

  const campo = (c: Campo) => (
    <label key={String(c.id)} className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{c.rotulo}</span>
      <input
        name={String(c.id)}
        value={valores[String(c.id)] ?? ""}
        onChange={(e) => setValores((v) => ({ ...v, [String(c.id)]: e.target.value }))}
        inputMode="decimal"
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-right font-mono text-sm tabular-nums focus:border-primary focus:outline-none"
      />
      {c.ajuda && <span className="mt-0.5 block text-[10px] text-slate-400">{c.ajuda}</span>}
    </label>
  );

  return (
    <form action={salvarMes} className="space-y-4">
      <input type="hidden" name="competencia" value={competencia} />

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Distribuição</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{DISTRIBUICAO.map(campo)}</div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Armazém — turnos que você define
        </p>
        <p className="mb-2 text-[11px] text-slate-500">
          Operadores da noite e da manhã saem da conta (volume, TMA e jornada). O resto é o desenho da sua operação.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ARMAZEM.map(campo)}</div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Acompanhamento</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ACOMPANHAMENTO.map(campo)}</div>
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">
            Observação da revisão do mês
          </span>
          <textarea
            name="observacao"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="O que mudou, o que foi combinado com a área de Gente, o que explica o desvio."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      {/* A CONTA AO VIVO: mudar o volume mostra a frota e a gente na hora. */}
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prévia</p>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[13px] tabular-nums text-slate-700 sm:grid-cols-3">
          <span>Dias úteis: <b>{previa.dist.diasUteis}</b></span>
          <span>Linear/dia: <b>{formatarNumero(previa.dist.linear, 0)} HL</b></span>
          <span>Frota: <b>{formatarNumero(previa.dist.frotasReal, 1)}</b></span>
          <span>Frota dimensionada: <b>{previa.dist.frotaDimensionada}</b></span>
          <span>Mapas/dia: <b>{formatarNumero(previa.arm.mapsPrevistos, 1)}</b></span>
          <span>Operadores: <b>{formatarNumero(previa.arm.operadores, 1)}</b></span>
        </div>
      </div>

      {previa.problema && <p className="text-xs font-medium text-red-600">{previa.problema}</p>}

      <BotaoEnviar
        textoEnviando="Salvando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        Salvar o mês e registrar a revisão
      </BotaoEnviar>
    </form>
  );
}
