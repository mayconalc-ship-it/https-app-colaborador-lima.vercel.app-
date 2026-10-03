"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormNoLugar } from "@/components/FormNoLugar";
import { SelecaoPilarPadrao } from "@/components/quiz/SelecaoPilarPadrao";
import { AREAS, type AreaId } from "@/lib/areas";
import {
  MAX_PERGUNTAS,
  PERGUNTAS_PADRAO,
  nomeDoMes,
  pilarSugerido,
  quandoFoiUsado,
  usosDoPadrao,
  type UsoDePadrao,
} from "@/lib/quiz";
import type { ResultadoAcao } from "@/lib/resultado-acao";
import { Marca } from "@/components/Icone";

const ENTRADA =
  "w-full rounded-lg border border-slate-200 bg-white p-2 text-base focus:border-primary focus:outline-none";

type Padrao = { id: number; nome: string; pilar: string | null };

function primeiroDia(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

function ultimoDia(ano: number, mes: number) {
  // Dia 0 do mês seguinte = último dia deste. Em UTC para não depender do fuso.
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/**
 * CRIAR O DESAFIO DO MÊS, EM TRÊS PASSOS (02/10/2026).
 *
 * Pedido do dono: "melhore a visualização dessa página de criação". Era
 * uma coluna de dez campos sem ordem de leitura, com a área num select
 * escondido -- e a área é a primeira decisão, a que muda o resto (que
 * padrões já foram usados, qual pilar sugerir).
 *
 * 1. Para quem e quando: a área em dois botões grandes, mês e ano. As
 *    datas de abrir e fechar ACOMPANHAM o mês escolhido (antes ficavam
 *    presas no mês de hoje, e criar o desafio de novembro em outubro
 *    abria a rodada em outubro sem ninguém notar). Mexeu à mão na data,
 *    ela para de acompanhar.
 * 2. Do que trata: pilar, padrão (com os já usados NESTA ÁREA marcados) e
 *    a atividade.
 * 3. Tamanho e nome.
 *
 * O botão diz o que acontece depois: a rodada é criada e a tela seguinte
 * é a de gerar e revisar as perguntas. "Criar rascunho" escondia isso.
 */
export function FormNovaRodada({
  acao,
  pilares,
  padroes,
  usos,
  anoAtual,
  mesAtual,
}: {
  acao: (formData: FormData) => Promise<ResultadoAcao>;
  pilares: { id: number | string; nome: string }[];
  padroes: Padrao[];
  usos: UsoDePadrao[];
  anoAtual: number;
  mesAtual: number;
}) {
  const [area, setArea] = useState<AreaId | "">("");
  const [mes, setMes] = useState(mesAtual);
  const [ano, setAno] = useState(anoAtual);
  const [inicio, setInicio] = useState(primeiroDia(anoAtual, mesAtual));
  const [fim, setFim] = useState(ultimoDia(anoAtual, mesAtual));
  const [datasAMao, setDatasAMao] = useState(false);

  function trocarMes(novoMes: number, novoAno: number) {
    setMes(novoMes);
    setAno(novoAno);
    if (!datasAMao && novoAno >= 2020 && novoAno <= 2100) {
      setInicio(primeiroDia(novoAno, novoMes));
      setFim(ultimoDia(novoAno, novoMes));
    }
  }

  const usadoEm = (p: Padrao) => (area ? quandoFoiUsado(usosDoPadrao(usos, p, area)) : null);
  const usadosNaArea = area ? padroes.filter((p) => usadoEm(p)).length : 0;
  const curtoDaArea = AREAS.find((a) => a.id === area)?.curto;

  // Já existe desafio desta área neste mês? Avisa antes de duplicar.
  const doMesmoMes = area
    ? usos.find((u) => u.area === area && u.mes === mes && u.temporada === ano)
    : undefined;

  return (
    <FormNoLugar acao={acao} className="space-y-4 border-t border-slate-100 p-4">
      {/* ---- 1. Para quem e quando ---- */}
      <Passo numero={1} titulo="Para quem e quando">
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-slate-600">Área</legend>
          <div className="grid grid-cols-2 gap-2">
            {AREAS.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer flex-col items-center rounded-xl border-2 p-3 text-center transition-colors ${
                  area === a.id
                    ? "border-primary bg-primary-soft text-primary-dark"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="area"
                  value={a.id}
                  required
                  checked={area === a.id}
                  onChange={() => setArea(a.id)}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden>
                  {a.id === "AL" ? <Marca desenho="armazem" /> : "🚚"}
                </span>
                <span className="mt-1 text-sm font-bold">{a.curto}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <Campo rotulo="Mês" className="flex-1">
            <select
              name="mes"
              value={mes}
              onChange={(e) => trocarMes(Number(e.target.value), ano)}
              className={ENTRADA}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {nomeDoMes(m)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Ano" className="w-28">
            <input
              name="temporada"
              type="number"
              value={ano}
              onChange={(e) => trocarMes(mes, Number(e.target.value))}
              className={ENTRADA}
            />
          </Campo>
        </div>

        {doMesmoMes && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            ⚠️ Já existe o desafio &quot;{doMesmoMes.nome}&quot; de {curtoDaArea} em{" "}
            {nomeDoMes(mes)}/{ano}. Confira no histórico abaixo antes de criar outro.
          </p>
        )}

        <div className="flex gap-2">
          <Campo rotulo="Abre em" className="flex-1">
            <input
              name="inicio"
              type="date"
              required
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setDatasAMao(true);
              }}
              className={ENTRADA}
            />
          </Campo>
          <Campo rotulo="Fecha em" className="flex-1">
            <input
              name="fim"
              type="date"
              required
              value={fim}
              onChange={(e) => {
                setFim(e.target.value);
                setDatasAMao(true);
              }}
              className={ENTRADA}
            />
          </Campo>
        </div>
      </Passo>

      {/* ---- 2. Do que trata ---- */}
      <Passo numero={2} titulo="Do que o desafio trata">
        {area ? (
          <p className="text-xs text-slate-500">
            Sugestão de pilar para {curtoDaArea}: <strong>{pilarSugerido(area)}</strong>.{" "}
            {usadosNaArea > 0
              ? `Os ${usadosNaArea} padrão(ões) já usados em ${curtoDaArea} aparecem marcados com "já usado em".`
              : `Nenhum padrão foi usado ainda em ${curtoDaArea}.`}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Escolha a área no passo 1 para ver quais padrões ela já cobrou.
          </p>
        )}

        <SelecaoPilarPadrao pilares={pilares} padroes={padroes} usadoEm={usadoEm} />

        <Campo
          rotulo="Atividade (opcional)"
          ajuda="O recorte do padrão que este mês cobra. Ex.: Conferência de carregamento."
        >
          <input name="atividade" className={ENTRADA} />
        </Campo>
      </Passo>

      {/* ---- 3. Tamanho e nome ---- */}
      <Passo numero={3} titulo="Tamanho e nome">
        <div className="flex gap-2">
          <Campo rotulo="Perguntas" className="w-32">
            <select name="total_perguntas" defaultValue={PERGUNTAS_PADRAO} className={ENTRADA}>
              {Array.from({ length: MAX_PERGUNTAS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === PERGUNTAS_PADRAO ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nome (opcional)" className="flex-1" ajuda="Vazio, o nome sai sozinho.">
            <input
              name="nome"
              placeholder={`Desafio de ${nomeDoMes(mes)} — ${curtoDaArea ?? "Área"}`}
              className={ENTRADA}
            />
          </Campo>
        </div>
      </Passo>

      <BotaoEnviar
        textoEnviando="Criando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Criar e montar as perguntas →
      </BotaoEnviar>
      <p className="-mt-2 text-center text-xs text-slate-500">
        A rodada nasce em rascunho e você vai direto para gerar e revisar as perguntas. O time
        só vê depois que você publicar.
      </p>
    </FormNoLugar>
  );
}

function Passo({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl bg-slate-50 p-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
          aria-hidden
        >
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Campo({
  rotulo,
  ajuda,
  className = "",
  children,
}: {
  rotulo: string;
  ajuda?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</label>
      {children}
      {ajuda && <p className="mt-1 text-xs text-slate-400">{ajuda}</p>}
    </div>
  );
}
