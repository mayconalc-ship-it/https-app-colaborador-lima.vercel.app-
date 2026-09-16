import { PageHeader } from "@/components/PageHeader";
import { CartaoEstoque } from "@/components/material-apoio/CartaoEstoque";
import { FormContagem } from "@/app/material-de-apoio/FormContagem";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { FAIXAS, formatarReais, type Faixa } from "@/lib/material-apoio";
import type { ItemDoEstoque } from "@/lib/material-apoio-server";

export type LoteRecente = {
  id: string;
  contado_em: string;
  quem: string;
  observacao: string | null;
  itens: string[];
};

/** A ordem de leitura: o que pede compra primeiro. */
const ORDEM_DA_FAIXA: Faixa[] = ["abaixo-minima", "perto-minima", "abaixo-objetivo", "sem-contagem", "ok", "acima-maxima"];

/**
 * O CUSTO DO MATERIAL DE APOIO (16/09/2026, pedido do dono: "ter noção de
 * quanto é o nosso custo com esses materiais diário e mensal").
 *
 * A soma do que tem valor cadastrado. Quando falta valor em algum produto,
 * a tela diz quantos -- um total que omite itens em silêncio parece menor
 * do que é.
 */
function ResumoDoCusto({ estoque }: { estoque: ItemDoEstoque[] }) {
  const comValor = estoque.filter((i) => i.situacao.custoDiario != null);
  const semValor = estoque.length - comValor.length;
  const dia = comValor.reduce((t, i) => t + (i.situacao.custoDiario ?? 0), 0);
  const estoqueHoje = comValor.reduce((t, i) => t + (i.situacao.valorDoEstoque ?? 0), 0);

  if (comValor.length === 0) {
    return (
      <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
        💰 O custo aparece aqui quando o valor de cada material for informado no cadastro.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">💰 Custo do material de apoio</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatarReais(dia)}</p>
          <p className="text-xs text-slate-500">por dia</p>
        </div>
        <div>
          <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatarReais(dia * 30)}</p>
          <p className="text-xs text-slate-500">por mês (30 dias)</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatarReais(estoqueHoje)}</p>
          <p className="text-xs text-slate-500">em estoque hoje</p>
        </div>
      </div>
      {semValor > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          {semValor} {semValor === 1 ? "produto está" : "produtos estão"} sem valor e {semValor === 1 ? "fica" : "ficam"} fora
          da soma.
        </p>
      )}
    </div>
  );
}

/**
 * A TELA DO MATERIAL DE APOIO, só a apresentação.
 *
 * Separada da página, que lê o banco, para a mesma tela poder ser conferida
 * com dados de exemplo antes de ir ao ar.
 *
 * A CONTAGEM VEM PRIMEIRO (16/09/2026, pedido do dono): quem abre este
 * módulo no armazém abre para contar. A situação do estoque e o custo, que
 * são leitura, ficam logo abaixo.
 */
export function TelaDoEstoque({
  estoque,
  podeContar,
  hoje,
  lotes,
  erro,
  sucesso,
}: {
  estoque: ItemDoEstoque[];
  podeContar: boolean;
  hoje: string;
  lotes: LoteRecente[];
  erro?: string;
  sucesso?: string;
}) {
  const ordenado = [...estoque].sort(
    (a, b) => ORDEM_DA_FAIXA.indexOf(a.situacao.faixa) - ORDEM_DA_FAIXA.indexOf(b.situacao.faixa),
  );
  const quantosNa = (f: Faixa) => estoque.filter((i) => i.situacao.faixa === f).length;

  return (
    <div>
      <PageHeader
        title="🧰 Material de Apoio"
        subtitle="Conte o estoque e veja quantos dias ele dura, quanto custa — e quando é hora de comprar."
      />

      {erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{erro}</p>}
      {sucesso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sucesso}</p>}

      {estoque.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Nenhum produto cadastrado ainda. A liderança cadastra em Modo Liderança → Configuração → Material de Apoio.
        </div>
      ) : (
        <div className="space-y-8">
          {podeContar && (
            <FormContagem
              hoje={hoje}
              produtos={estoque.map(({ produto: p, ultima }) => ({
                id: p.id,
                nome: p.nome,
                unidade: p.unidade,
                linear_quantidade: p.linear_quantidade,
                linear_periodo: p.linear_periodo,
                politica_minima_dias: p.politica_minima_dias,
                politica_objetivo_dias: p.politica_objetivo_dias,
                politica_maxima_dias: p.politica_maxima_dias,
                antecedencia_alerta_dias: p.antecedencia_alerta_dias,
                valor_unitario: p.valor_unitario,
                media_real_diaria: p.media_real_diaria,
                ultima_quantidade: ultima?.quantidade ?? null,
              }))}
            />
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Situação do estoque</h2>
            <ResumoDoCusto estoque={estoque} />
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {(["abaixo-minima", "perto-minima", "abaixo-objetivo", "ok", "acima-maxima", "sem-contagem"] as Faixa[])
                .filter((f) => quantosNa(f) > 0)
                .map((f) => (
                  <span key={f} className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-slate-700 ring-1 ring-slate-200">
                    {FAIXAS[f].rotulo}: {quantosNa(f)}
                  </span>
                ))}
            </div>
            <ul className="space-y-3">
              {ordenado.map((item) => (
                <CartaoEstoque key={item.produto.id} item={item} />
              ))}
            </ul>
          </section>

          {lotes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Contagens recentes</h2>
              <ul className="space-y-2">
                {lotes.map((l) => (
                  <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                    <p className="text-xs text-slate-500">
                      {formatarDataHora(l.contado_em)} · {l.quem}
                    </p>
                    <p className="mt-1 text-slate-800">{l.itens.join(" · ")}</p>
                    {l.observacao && <p className="mt-1 text-xs text-slate-500">{l.observacao}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
