"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  MES_VAZIO,
  ROTULO_BASE_DA_META,
  calendarioDaCompetencia,
  conferenciaDoPlano,
  volumePorDia,
  contaArmazem,
  contaDistribuicao,
  formatarNumero,
  lerNumeroDigitado,
  mostrarNumero,
  rotuloCompetencia,
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
  { id: "dias_totais", rotulo: "Dias de operação", ajuda: "Dias úteis + sábados (o “dia TT”)." },
  { id: "sabados", rotulo: "Sábados no mês", ajuda: "Já estão dentro dos dias de operação." },
  { id: "volume_entrega_sabado", rotulo: "Volume por sábado (HL)", ajuda: "O sábado entrega menos." },
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
      // base_meta é uma escolha (select), não um número: deixar entrar aqui
      // a transformava em null e quebrava a tela (25/09/2026).
      if (chave === "competencia" || chave === "observacao" || chave === "base_meta") continue;
      const valor = mes ? (mes[chave as keyof MesMaoDeObra] as number | null) : null;
      base[chave] = mostrarNumero(valor, 2);
    }
    return base;
  }, [mes]);

  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [observacao, setObservacao] = useState(mes?.observacao ?? "");

  const previa = useMemo(() => {
    const m: MesMaoDeObra = { ...MES_VAZIO, competencia, base_meta: mes?.base_meta ?? "negociado" };
    for (const chave of Object.keys(valores)) {
      if (chave === "base_meta") continue;
      (m[chave as keyof MesMaoDeObra] as number | null) = lerNumeroDigitado(valores[chave]);
    }
    return {
      dist: contaDistribuicao(m),
      arm: contaArmazem(m, config),
      problema: validarMes(m),
      conferencia: conferenciaDoPlano(m, volumePorDia(m, new Map())),
    };
  }, [valores, competencia, config, mes?.base_meta]);

  const calendario = useMemo(() => calendarioDaCompetencia(competencia), [competencia]);
  const usarOCalendario = () =>
    setValores((v) => ({
      ...v,
      dias_totais: String(calendario.corridos - calendario.domingos),
      sabados: String(calendario.sabados),
    }));

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

      {/* O CALENDÁRIO, à mão: é o que faz a meta do dia fechar com o
          volume negociado (25/09/2026). */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <span>
          {rotuloCompetencia(competencia)} tem <b>{calendario.corridos}</b> dias:{" "}
          <b>{calendario.uteis}</b> de semana, <b>{calendario.sabados}</b> sábados e{" "}
          <b>{calendario.domingos}</b> domingos.
        </span>
        <button
          type="button"
          title="Preenche dias de operação (úteis + sábados) e sábados pelo calendário"
          onClick={usarOCalendario}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary"
        >
          Usar o calendário
        </button>
      </div>

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
            Volume que a grade do dia distribui
          </span>
          <select
            name="base_meta"
            defaultValue={mes?.base_meta ?? "negociado"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="negociado">Volume negociado</option>
            <option value="ppr">Volume PPR</option>
          </select>
          <span className="mt-0.5 block text-[10px] text-slate-400">
            A meta de cada dia soma exatamente este volume.
          </span>
        </label>
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

      {/* A SOMA DOS DIAS TEM DE DAR O VOLUME NEGOCIADO. Quando não dá, a
          tela diz exatamente o que ajustar. */}
      {previa.conferencia.volumeBase > 0 && (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"
        >
          ✅ A meta dos dias soma <b>{formatarNumero(previa.conferencia.planoDoMes, 0)} HL</b> — exatamente o{" "}
          {ROTULO_BASE_DA_META[previa.conferencia.base].toLowerCase()} informado, dividido em{" "}
          {previa.conferencia.uteisQueOperam} dias úteis e {previa.conferencia.sabadosQueOperam} sábados.
        </p>
      )}

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
