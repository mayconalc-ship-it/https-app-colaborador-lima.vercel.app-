"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { CampoFoto } from "@/components/CampoFoto";
import { FormNoLugar } from "@/components/FormNoLugar";
import {
  FOTOS_POR_ITEM,
  prazoSugerido,
  separarCriterios,
  type ItemManut,
  type Nota,
} from "@/lib/manutencao";
import type { ResultadoAcao } from "@/lib/resultado-acao";

export type RespostaDoCartao = {
  nota: Nota | null;
  na: boolean;
  observacao: string | null;
  planoAcao: string | null;
  responsavel: string | null;
  prazo: string | null;
  respondidoPorNome: string;
  fotos: { id: string; url: string | null }[];
};

export type AnteriorDoCartao = {
  rotulo: string;
  nota: Nota | null;
  na: boolean;
  fotos: { id: string; url: string | null }[];
};

const OPCOES: { valor: "3" | "1" | "0" | "na"; rotulo: string; cor: string; ativo: string }[] = [
  { valor: "3", rotulo: "3", cor: "border-emerald-200 text-emerald-700", ativo: "border-emerald-600 bg-emerald-600 text-white" },
  { valor: "1", rotulo: "1", cor: "border-amber-200 text-amber-700", ativo: "border-amber-500 bg-amber-500 text-white" },
  { valor: "0", rotulo: "0", cor: "border-red-200 text-red-700", ativo: "border-red-600 bg-red-600 text-white" },
  { valor: "na", rotulo: "N/A", cor: "border-slate-200 text-slate-500", ativo: "border-slate-600 bg-slate-600 text-white" },
];

function corDaNota(nota: Nota | null, na: boolean) {
  if (na) return "bg-slate-100 text-slate-600";
  if (nota === 3) return "bg-emerald-100 text-emerald-800";
  if (nota === 1) return "bg-amber-100 text-amber-800";
  if (nota === 0) return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-500";
}

function Miniatura({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return <span className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">sem link</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title="Abrir a foto inteira">
      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do bucket privado, fora do otimizador */}
      <img src={url} alt={alt} loading="lazy" className="aspect-square w-full rounded-lg border border-slate-200 object-cover" />
    </a>
  );
}

/**
 * UM ITEM DO CHECK DE MANUTENÇÃO.
 *
 * Tudo o que a auditoria pergunta sobre o item está no cartão: a nota
 * (com o critério da planilha da Ambev ao lado de cada número), as fotos
 * deste trimestre, a do trimestre anterior para comparar, e -- abaixo de
 * 3 -- o plano de ação com responsável e prazo.
 *
 * Salva sozinho e no lugar (FormNoLugar): quem está no 5.3 continua no
 * 5.3, com o aviso de salvo no rodapé.
 */
export function CartaoItem({
  item,
  avaliacaoId,
  resposta,
  anterior,
  aberta,
  hojeIso,
  salvar,
  removerFoto,
}: {
  item: ItemManut;
  avaliacaoId: string;
  resposta: RespostaDoCartao | null;
  anterior: AnteriorDoCartao | null;
  aberta: boolean;
  hojeIso: string;
  salvar: (fd: FormData) => Promise<ResultadoAcao>;
  removerFoto: (fd: FormData) => Promise<ResultadoAcao>;
}) {
  const inicial = resposta ? (resposta.na ? "na" : resposta.nota !== null ? String(resposta.nota) : "") : "";
  const [escolha, setEscolha] = useState(inicial);
  const caixa = useRef<HTMLDivElement>(null);
  const criterios = separarCriterios(item.criterios);
  const abaixo = escolha === "1" || escolha === "0";
  const fotos = resposta?.fotos ?? [];
  const cabemMais = FOTOS_POR_ITEM - fotos.length;
  const salvo = !!resposta;
  const mudou = escolha !== inicial;

  return (
    <div
      ref={caixa}
      id={`item-${item.numero}`}
      className={`scroll-mt-28 rounded-2xl border bg-white p-4 shadow-sm ${
        salvo && !mudou ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      {/* ---- Cabeçalho ---- */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-xs font-bold text-primary-dark">{item.numero}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-slate-900">{item.pergunta}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {item.critico && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">⚠️ Item crítico</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">Peso {item.peso}</span>
            {salvo && (
              <span className={`rounded-full px-2 py-0.5 font-bold ${corDaNota(resposta.nota, resposta.na)}`}>
                {resposta.na ? "N/A" : `Nota ${resposta.nota}`} · {resposta.respondidoPorNome.split(" ")[0]}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <details className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-primary-dark">🔎 Como verificar</summary>
          <p className="mt-2 leading-relaxed">{item.verificacao}</p>
        </details>
        <Link
          href={`/manutencao/item/${item.numero}`}
          className="shrink-0 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-primary-dark hover:bg-slate-100"
          title="Todas as avaliações deste item, com as fotos"
        >
          📈 Evolução
        </Link>
      </div>

      {/* ---- Trimestre anterior, para comparar ---- */}
      {anterior && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3">
          <p className="text-xs font-semibold text-slate-600">
            {anterior.rotulo}:{" "}
            <span className={`rounded-full px-2 py-0.5 ${corDaNota(anterior.nota, anterior.na)}`}>
              {anterior.na ? "N/A" : anterior.nota === null ? "sem nota" : `nota ${anterior.nota}`}
            </span>
          </p>
          {anterior.fotos.length > 0 ? (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {anterior.fotos.map((f, i) => (
                <Miniatura key={f.id} url={f.url} alt={`${anterior.rotulo}, foto ${i + 1} do item ${item.numero}`} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">Sem foto no trimestre anterior.</p>
          )}
        </div>
      )}

      {/* ---- Fotos já enviadas neste trimestre ---- */}
      {fotos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {fotos.map((f, i) => (
            <div key={f.id} className="relative">
              <Miniatura url={f.url} alt={`Foto ${i + 1} do item ${item.numero}`} />
              {aberta && (
                <div className="absolute right-1 top-1">
                  <BotaoNoLugar
                    acao={removerFoto}
                    campos={{ foto_id: f.id }}
                    confirmacao="Tirar esta foto do item?"
                    rotuloConfirmar="Tirar a foto"
                    textoEnviando="…"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                    title="Tirar esta foto"
                  >
                    ✕
                  </BotaoNoLugar>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {aberta ? (
        <FormNoLugar
          acao={salvar}
          className="mt-3 space-y-3"
          aoSalvar={() => {
            // As fotos subiram: o campo volta a vazio para não reenviar.
            const campo = caixa.current?.querySelector<HTMLInputElement>('input[type="file"]');
            if (campo) campo.value = "";
          }}
        >
          <input type="hidden" name="avaliacao_id" value={avaliacaoId} />
          <input type="hidden" name="item_id" value={item.id} />

          {/* ---- A nota ---- */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Nota</legend>
            <div className="grid grid-cols-4 gap-2">
              {OPCOES.map((o) => (
                <label
                  key={o.valor}
                  className={`flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-lg font-bold transition-colors ${
                    escolha === o.valor ? o.ativo : `${o.cor} bg-white`
                  }`}
                >
                  <input
                    type="radio"
                    name="nota"
                    value={o.valor}
                    checked={escolha === o.valor}
                    onChange={() => setEscolha(o.valor)}
                    className="sr-only"
                  />
                  {o.rotulo}
                </label>
              ))}
            </div>
            {escolha && escolha !== "na" && criterios[Number(escolha) as Nota] && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                <strong>{escolha}:</strong> {criterios[Number(escolha) as Nota]}
              </p>
            )}
            {escolha === "na" && (
              <p className="mt-2 text-xs text-slate-500">Não se aplica à unidade: o item sai da conta da seção.</p>
            )}
          </fieldset>

          {/* ---- Fotos novas ---- */}
          {cabemMais > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                📷 Fotos da condição atual <span className="font-normal normal-case text-slate-400">(até {cabemMais})</span>
              </label>
              <CampoFoto
                name="fotos"
                accept="image/*"
                capture="environment"
                multiple
                className="w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-dark"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                A foto é reduzida no celular e no servidor: fica leve e nítida para a auditoria.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Este item já tem {FOTOS_POR_ITEM} fotos. Tire uma para trocar.</p>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`obs-${item.id}`}>
              Observação <span className="font-normal normal-case text-slate-400">(opcional)</span>
            </label>
            <textarea
              id={`obs-${item.id}`}
              name="observacao"
              rows={2}
              maxLength={1000}
              defaultValue={resposta?.observacao ?? ""}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-base focus:border-primary focus:outline-none"
            />
          </div>

          {/* ---- Plano de ação: só abaixo de 3 ---- */}
          {abaixo && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">
                📋 Plano de ação {item.critico && "· item crítico: reparo em curto prazo ou CAPEX emergencial"}
              </p>
              <textarea
                name="plano_acao"
                rows={2}
                required
                maxLength={1000}
                defaultValue={resposta?.planoAcao ?? ""}
                placeholder="O que vai ser feito"
                aria-label="O que vai ser feito"
                className="w-full rounded-lg border border-amber-200 bg-white p-2.5 text-base focus:border-amber-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  name="responsavel"
                  required
                  maxLength={120}
                  defaultValue={resposta?.responsavel ?? ""}
                  placeholder="Responsável"
                  aria-label="Responsável"
                  className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white p-2.5 text-base focus:border-amber-500 focus:outline-none"
                />
                <input
                  name="prazo"
                  type="date"
                  required
                  defaultValue={resposta?.prazo ?? prazoSugerido(hojeIso, item.critico)}
                  aria-label="Prazo"
                  className="w-40 rounded-lg border border-amber-200 bg-white p-2.5 text-base focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <BotaoEnviar
            textoEnviando="Salvando..."
            disabled={!escolha}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {salvo ? `Salvar alterações do item ${item.numero}` : `Salvar item ${item.numero}`}
          </BotaoEnviar>
        </FormNoLugar>
      ) : (
        // Avaliação fechada: só leitura -- o que foi registrado.
        resposta && (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {resposta.observacao && (
              <p>
                <strong>Observação:</strong> {resposta.observacao}
              </p>
            )}
            {resposta.planoAcao && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">
                <strong>Plano de ação:</strong> {resposta.planoAcao} · {resposta.responsavel} · até{" "}
                {resposta.prazo?.split("-").reverse().join("/")}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
