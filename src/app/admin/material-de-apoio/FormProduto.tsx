"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  LIMITES,
  MINIMO_DIAS_DA_MEDIA,
  PERIODOS,
  UNIDADES,
  consumoDiario,
  curtoDaUnidade,
  formatarAproximado,
  formatarReais,
  lerNumero,
  validarProduto,
} from "@/lib/material-apoio";
import { salvarProduto } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export type ProdutoInicial = {
  id: string;
  nome: string;
  unidade: string;
  linear_quantidade: number;
  linear_periodo: string;
  politica_minima_dias: number;
  politica_objetivo_dias: number;
  politica_maxima_dias: number;
  antecedencia_alerta_dias: number;
  valor_unitario: number | null;
};

/**
 * Cadastro do produto -- um Salvar só, que liga quando `validarProduto`
 * (a mesma da ação) não acha problema. Mostra, enquanto se digita, o
 * consumo por dia e o estoque que cada política representa: "15 dias" vira
 * "15 dias = 180 kg", que é o número que quem compra conhece.
 */
export function FormProduto({ inicial }: { inicial?: ProdutoInicial }) {
  const [v, setV] = useState({
    nome: inicial?.nome ?? "",
    unidade: inicial?.unidade ?? "kg",
    linear_quantidade: inicial ? String(inicial.linear_quantidade) : "",
    linear_periodo: inicial?.linear_periodo ?? "dia",
    politica_minima_dias: inicial ? String(inicial.politica_minima_dias) : "",
    politica_objetivo_dias: inicial ? String(inicial.politica_objetivo_dias) : "",
    politica_maxima_dias: inicial ? String(inicial.politica_maxima_dias) : "",
    antecedencia_alerta_dias: inicial ? String(inicial.antecedencia_alerta_dias) : "2",
    valor_unitario: inicial?.valor_unitario != null ? String(inicial.valor_unitario) : "",
  });
  const mudar = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((a) => ({ ...a, [k]: e.target.value }));

  const dados = {
    nome: v.nome,
    unidade: v.unidade,
    linear_quantidade: lerNumero(v.linear_quantidade),
    linear_periodo: v.linear_periodo,
    politica_minima_dias: lerNumero(v.politica_minima_dias),
    politica_objetivo_dias: lerNumero(v.politica_objetivo_dias),
    politica_maxima_dias: lerNumero(v.politica_maxima_dias),
    antecedencia_alerta_dias: lerNumero(v.antecedencia_alerta_dias),
    valor_unitario: lerNumero(v.valor_unitario),
  };
  const erro = validarProduto(dados);
  const consumo =
    dados.linear_quantidade && dados.linear_quantidade > 0 ? consumoDiario(dados.linear_quantidade, v.linear_periodo) : null;
  const emEstoque = (dias: number | null) =>
    consumo != null && dias != null && Number.isFinite(dias) ? ` = ${formatarAproximado(dias * consumo, v.unidade)}` : "";

  return (
    <form action={salvarProduto} className="space-y-3">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
        <div>
          <label className={rotulo} htmlFor={`nome-${inicial?.id ?? "novo"}`}>Produto</label>
          <input
            id={`nome-${inicial?.id ?? "novo"}`}
            name="nome"
            required
            minLength={LIMITES.nomeMin}
            maxLength={LIMITES.nomeMax}
            value={v.nome}
            onChange={mudar("nome")}
            placeholder="Ex: Filme stretch"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor={`unidade-${inicial?.id ?? "novo"}`}>Unidade</label>
          <select id={`unidade-${inicial?.id ?? "novo"}`} name="unidade" value={v.unidade} onChange={mudar("unidade")} className={campo}>
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>{u.rotulo} ({u.curto})</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={rotulo}>Linear de uso — quanto se gasta</span>
        <div className="grid grid-cols-[1fr_auto_10rem] items-center gap-2">
          <input
            name="linear_quantidade"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            required
            value={v.linear_quantidade}
            onChange={mudar("linear_quantidade")}
            aria-label="Quantidade da linear de uso"
            className={`${campo} text-right tabular-nums`}
          />
          <span className="text-sm font-semibold text-slate-500">{curtoDaUnidade(v.unidade)}</span>
          <select name="linear_periodo" value={v.linear_periodo} onChange={mudar("linear_periodo")} aria-label="Período da linear" className={campo}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>{p.rotulo}</option>
            ))}
          </select>
        </div>
        {consumo != null && v.linear_periodo !== "dia" && (
          <p className="mt-1 text-xs text-slate-500">≈ {formatarAproximado(consumo, v.unidade)} por dia</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          É o ponto de partida. Com contagens em {MINIMO_DIAS_DA_MEDIA} dias ou mais, o app passa a usar a média real de
          saída.
        </p>
      </div>

      {/* O VALOR (16/09/2026, pedido do dono): para saber o custo do
          material por dia e por mês. Opcional -- sem ele, o produto só fica
          fora da soma do custo. */}
      <div>
        <label className={rotulo} htmlFor={`valor-${inicial?.id ?? "novo"}`}>
          Valor (R$ por {curtoDaUnidade(v.unidade)}) <span className="normal-case text-slate-400">(opcional)</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm font-semibold text-slate-500">R$</span>
          <input
            id={`valor-${inicial?.id ?? "novo"}`}
            name="valor_unitario"
            type="number"
            inputMode="decimal"
            min={0}
            max={LIMITES.valorMax}
            step="0.01"
            value={v.valor_unitario}
            onChange={mudar("valor_unitario")}
            className={`${campo} min-w-0 flex-1 text-right tabular-nums`}
          />
        </div>
        {consumo != null && dados.valor_unitario != null && Number.isFinite(dados.valor_unitario) && (
          <p className="mt-1 text-xs text-slate-500">
            Custo pela linear: ≈ {formatarReais(consumo * dados.valor_unitario)} por dia ·{" "}
            {formatarReais(consumo * dados.valor_unitario * 30)} por mês
          </p>
        )}
      </div>

      <div>
        <span className={rotulo}>Políticas de estoque (dias)</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["politica_minima_dias", "Mínima"],
              ["politica_objetivo_dias", "Objetiva"],
              ["politica_maxima_dias", "Máxima"],
            ] as const
          ).map(([nome, r]) => (
            <div key={nome}>
              <label className="mb-0.5 block text-[11px] font-semibold text-slate-500" htmlFor={`${nome}-${inicial?.id ?? "novo"}`}>
                {r}
              </label>
              <input
                id={`${nome}-${inicial?.id ?? "novo"}`}
                name={nome}
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITES.diasMax}
                step={1}
                required
                value={v[nome]}
                onChange={mudar(nome)}
                className={`${campo} text-right tabular-nums`}
              />
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{emEstoque(lerNumero(v[nome])).replace(/^ = /, "")}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-xs">
        <label className={rotulo} htmlFor={`antecedencia-${inicial?.id ?? "novo"}`}>Avisar com antecedência de (dias)</label>
        <input
          id={`antecedencia-${inicial?.id ?? "novo"}`}
          name="antecedencia_alerta_dias"
          type="number"
          inputMode="numeric"
          min={0}
          max={LIMITES.antecedenciaMax}
          step={1}
          required
          value={v.antecedencia_alerta_dias}
          onChange={mudar("antecedencia_alerta_dias")}
          className={`${campo} text-right tabular-nums`}
        />
        <p className="mt-1 text-xs text-slate-500">
          O alerta &ldquo;perto da mínima&rdquo; sai quando faltarem esses dias para chegar nela; o &ldquo;abaixo da
          mínima&rdquo;, quando passar dela.
        </p>
      </div>

      {erro && (v.nome || v.linear_quantidade) && <p className="text-xs font-semibold text-amber-700">{erro}</p>}

      <BotaoEnviar
        disabled={Boolean(erro)}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        {inicial ? "Salvar produto" : "Cadastrar produto"}
      </BotaoEnviar>
    </form>
  );
}
