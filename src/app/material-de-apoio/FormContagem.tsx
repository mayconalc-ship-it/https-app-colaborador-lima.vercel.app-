"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  FAIXAS,
  LIMITES,
  curtoDaUnidade,
  formatarDias,
  formatarQuantidade,
  lerNumero,
  situacaoDoEstoque,
  validarQuantidade,
  type ProdutoParaSituacao,
} from "@/lib/material-apoio";
import { registrarContagem } from "./actions";

export type ProdutoDaContagem = ProdutoParaSituacao & {
  id: string;
  nome: string;
  /** A quantidade da última contagem -- para perguntar pela entrada quando subir. */
  ultima_quantidade: number | null;
};

const COR_DA_PREVIA: Record<(typeof FAIXAS)[keyof typeof FAIXAS]["tom"], string> = {
  critico: "text-red-700",
  alerta: "text-amber-700",
  atencao: "text-yellow-800",
  ok: "text-green-700",
  excesso: "text-sky-700",
  neutro: "text-slate-500",
};

const CAMPO_NUMERO =
  "rounded-xl border border-slate-300 bg-white px-3 text-right font-semibold tabular-nums text-slate-900 focus:border-primary focus:outline-none";

/**
 * A contagem de todos os produtos, com um Salvar só no fim.
 *
 * CADA PRODUTO É UM BLOCO (16/09/2026, pedido do dono: "o texto está todo
 * na vertical"). Antes nome e campo dividiam a mesma linha, e o campo
 * recebia duas larguras que brigavam (w-full e w-28): a de 100% vencia, o
 * campo engolia a linha e a coluna do nome ficava com poucos pixels -- uma
 * letra por linha. Agora o nome ocupa a largura inteira em cima, e embaixo
 * vêm o campo grande da contagem e o da entrada.
 *
 * A ENTRADA (compra recebida desde a última contagem) é o que deixa calcular
 * a saída real: sem ela, uma reposição parece consumo negativo. Quando a
 * contagem digitada passa da anterior e a entrada está vazia, a linha
 * pergunta -- é nessa hora que a pessoa lembra que chegou material.
 *
 * O botão só liga com pelo menos um produto contado e nenhum valor
 * inválido -- as mesmas regras que a ação confere.
 */
export function FormContagem({ produtos, hoje }: { produtos: ProdutoDaContagem[]; hoje: string }) {
  const [contagem, setContagem] = useState<Record<string, string>>({});
  const [entrada, setEntrada] = useState<Record<string, string>>({});

  const problemaDe = (p: ProdutoDaContagem) => {
    const q = lerNumero(contagem[p.id]);
    const e = lerNumero(entrada[p.id]);
    const problema = validarQuantidade(q) ?? validarQuantidade(e);
    if (problema) return problema;
    if (q == null && e != null) return "Informe a contagem junto com a entrada.";
    return null;
  };

  const contados = produtos.filter((p) => lerNumero(contagem[p.id]) != null);
  const erro =
    produtos
      .map((p) => {
        const problema = problemaDe(p);
        return problema ? `${p.nome}: ${problema}` : null;
      })
      .find(Boolean) ?? (contados.length === 0 ? "Informe a quantidade de pelo menos um produto." : null);

  return (
    <form action={registrarContagem} className="space-y-4 rounded-2xl border-2 border-primary/30 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">📝 Contagem</h2>
        <p className="text-sm text-slate-600">
          Conte o que tem no estoque agora, na unidade de cada produto. Se chegou compra desde a última contagem,
          informe quanto entrou. O que não contou, deixe em branco.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {produtos.map((p) => {
          const q = lerNumero(contagem[p.id]);
          const e = lerNumero(entrada[p.id]);
          const problema = problemaDe(p);
          const previa =
            q != null && !problema ? situacaoDoEstoque(p, { quantidade: q, contado_em: `${hoje}T12:00:00-03:00` }, hoje) : null;
          const subiuSemEntrada =
            !problema && q != null && e == null && p.ultima_quantidade != null && q > p.ultima_quantidade;
          const unidade = curtoDaUnidade(p.unidade);

          return (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor={`qtd-${p.id}`} className="block text-base font-semibold leading-snug text-slate-900">
                {p.nome}
              </label>
              <p className="text-xs text-slate-500">
                {p.ultima_quantidade != null
                  ? `Última contagem: ${formatarQuantidade(p.ultima_quantidade, p.unidade)}`
                  : "Primeira contagem deste produto"}
              </p>

              <div className="mt-2 flex items-center gap-2">
                <input
                  id={`qtd-${p.id}`}
                  name={`qtd_${p.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITES.quantidadeMax}
                  step="any"
                  placeholder="Contagem"
                  value={contagem[p.id] ?? ""}
                  onChange={(ev) => setContagem((v) => ({ ...v, [p.id]: ev.target.value }))}
                  className={`${CAMPO_NUMERO} min-w-0 flex-1 py-2.5 text-lg`}
                />
                <span className="w-8 shrink-0 text-sm font-semibold text-slate-600">{unidade}</span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <label htmlFor={`ent-${p.id}`} className="min-w-0 flex-1 text-xs leading-tight text-slate-600">
                  Entrou desde a última contagem <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  id={`ent-${p.id}`}
                  name={`ent_${p.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITES.quantidadeMax}
                  step="any"
                  placeholder="0"
                  value={entrada[p.id] ?? ""}
                  onChange={(ev) => setEntrada((v) => ({ ...v, [p.id]: ev.target.value }))}
                  className={`${CAMPO_NUMERO} w-24 shrink-0 py-1.5 text-base`}
                />
                <span className="w-8 shrink-0 text-xs font-semibold text-slate-500">{unidade}</span>
              </div>

              {/* Só aparece com o que dizer: uma linha reservada em branco
                  alongava cada bloco e o formulário inteiro sem motivo. */}
              {(problema || previa?.dias != null) && (
                <p className="mt-2 text-sm">
                  {problema ? (
                    <span className="font-semibold text-red-700">{problema}</span>
                  ) : (
                    <span className={`font-semibold ${COR_DA_PREVIA[FAIXAS[previa!.faixa].tom]}`}>
                      ≈ {formatarDias(previa!.dias!)} dias de estoque · {FAIXAS[previa!.faixa].rotulo}
                    </span>
                  )}
                </p>
              )}
              {subiuSemEntrada && (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  Subiu desde a última contagem. Chegou compra? Informe quanto entrou — senão este período fica fora da
                  média real.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor="observacao" className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Observação (opcional)
        </label>
        <textarea
          id="observacao"
          name="observacao"
          rows={2}
          maxLength={LIMITES.observacaoMax}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
        />
      </div>

      {erro && contados.length > 0 && <p className="text-sm font-semibold text-red-700">{erro}</p>}

      <BotaoEnviar
        disabled={Boolean(erro)}
        textoEnviando="Registrando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark"
      >
        {contados.length > 0
          ? `Registrar contagem (${contados.length} produto${contados.length === 1 ? "" : "s"})`
          : "Registrar contagem"}
      </BotaoEnviar>
    </form>
  );
}
