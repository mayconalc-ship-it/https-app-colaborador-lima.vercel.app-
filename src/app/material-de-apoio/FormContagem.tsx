"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  FAIXAS,
  LIMITES,
  curtoDaUnidade,
  formatarDias,
  lerNumero,
  situacaoDoEstoque,
  validarQuantidade,
  type ProdutoParaSituacao,
} from "@/lib/material-apoio";
import { registrarContagem } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Produto = ProdutoParaSituacao & { id: string; nome: string };

/**
 * A contagem de todos os produtos, com um Salvar só no fim.
 *
 * Enquanto a pessoa digita, cada linha já mostra os dias de estoque e a
 * faixa -- é na hora da contagem que um número estranho (unidade errada,
 * um zero a mais) salta aos olhos, não depois de gravado. O botão só liga
 * com pelo menos um produto preenchido e nenhum valor inválido: as mesmas
 * regras que a ação confere.
 */
export function FormContagem({ produtos, hoje }: { produtos: Produto[]; hoje: string }) {
  const [valores, setValores] = useState<Record<string, string>>({});

  const preenchidos = produtos.filter((p) => (valores[p.id] ?? "").trim() !== "");
  const erro =
    produtos
      .map((p) => {
        const problema = validarQuantidade(lerNumero(valores[p.id]));
        return problema ? `${p.nome}: ${problema}` : null;
      })
      .find(Boolean) ?? (preenchidos.length === 0 ? "Informe a quantidade de pelo menos um produto." : null);

  return (
    <form action={registrarContagem} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">📝 Nova contagem</p>
      <p className="text-xs text-slate-500">
        Conte o que tem no estoque agora, na unidade de cada produto. Deixe em branco o que não contou.
      </p>

      <ul className="space-y-2">
        {produtos.map((p) => {
          const quantidade = lerNumero(valores[p.id]);
          const valida = quantidade != null && !validarQuantidade(quantidade);
          const previa = valida
            ? situacaoDoEstoque(p, { quantidade: quantidade!, contado_em: `${hoje}T12:00:00-03:00` }, hoje)
            : null;
          return (
            <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-slate-50 p-3">
              <label htmlFor={`qtd-${p.id}`} className="min-w-0">
                <span className="block break-words text-sm font-semibold text-slate-800">{p.nome}</span>
                {previa?.dias != null && (
                  <span className="block text-xs text-slate-500">
                    ≈ {formatarDias(previa.dias)} dias · {FAIXAS[previa.faixa].rotulo}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`qtd-${p.id}`}
                  name={`qtd_${p.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITES.quantidadeMax}
                  step="any"
                  value={valores[p.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
                  className={`${campo} w-28 text-right tabular-nums`}
                />
                <span className="w-7 text-xs font-semibold text-slate-500">{curtoDaUnidade(p.unidade)}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor="observacao" className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Observação (opcional)
        </label>
        <textarea id="observacao" name="observacao" rows={2} maxLength={LIMITES.observacaoMax} className={campo} />
      </div>

      {erro && preenchidos.length > 0 && <p className="text-xs font-semibold text-amber-700">{erro}</p>}

      <BotaoEnviar
        disabled={Boolean(erro)}
        textoEnviando="Registrando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Registrar contagem{preenchidos.length > 0 ? ` (${preenchidos.length})` : ""}
      </BotaoEnviar>
    </form>
  );
}
