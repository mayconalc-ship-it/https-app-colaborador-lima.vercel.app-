import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { CartaoEstoque } from "@/components/material-apoio/CartaoEstoque";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { lerEstoque, podeAbrirMaterialDeApoio } from "@/lib/material-apoio-server";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  FAIXAS,
  MODULO_MATERIAL_APOIO,
  formatarQuantidade,
  hojeSP,
  type Faixa,
} from "@/lib/material-apoio";
import { decodificar } from "@/lib/texto-url";
import { FormContagem } from "./FormContagem";

export const dynamic = "force-dynamic";

/** A ordem de leitura: o que pede compra primeiro. */
const ORDEM_DA_FAIXA: Faixa[] = ["abaixo-minima", "perto-minima", "abaixo-objetivo", "sem-contagem", "ok", "acima-maxima"];

export default async function MaterialDeApoioPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  if (!(await podeAbrirMaterialDeApoio())) {
    redirect(`/?erro=${encodeURIComponent("Você não tem acesso a este módulo. Fale com o Admin.")}`);
  }
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const sp = await searchParams;
  const hoje = hojeSP();

  const admin = createAdminClient();
  const [estoque, podeContar, { data: recentes }] = await Promise.all([
    lerEstoque(revendaId),
    temAcessoModulo(MODULO_MATERIAL_APOIO),
    admin
      .from("ma_contagens")
      .select("lote_id, produto_id, quantidade, contado_em, colaborador_nome, observacao")
      .eq("revenda_id", revendaId)
      .order("contado_em", { ascending: false })
      .limit(150),
  ]);

  const ordenado = [...estoque].sort(
    (a, b) => ORDEM_DA_FAIXA.indexOf(a.situacao.faixa) - ORDEM_DA_FAIXA.indexOf(b.situacao.faixa),
  );
  const contagemPorFaixa = (f: Faixa) => estoque.filter((i) => i.situacao.faixa === f).length;
  const nomeDo = new Map(estoque.map((i) => [i.produto.id, i.produto]));

  // As conciliações recentes, uma por envio.
  const lotes: { id: string; contado_em: string; quem: string; observacao: string | null; itens: string[] }[] = [];
  for (const c of recentes ?? []) {
    let lote = lotes.find((l) => l.id === c.lote_id);
    if (!lote) {
      if (lotes.length >= 10) continue;
      lote = { id: String(c.lote_id), contado_em: String(c.contado_em), quem: String(c.colaborador_nome), observacao: c.observacao, itens: [] };
      lotes.push(lote);
    }
    const p = nomeDo.get(String(c.produto_id));
    if (p) lote.itens.push(`${p.nome} ${formatarQuantidade(Number(c.quantidade), p.unidade)}`);
  }

  return (
    <div>
      <PageHeader
        title="🧰 Material de Apoio"
        subtitle="Filme stretch, filme contrátil, fitilho e outros — quantos dias de estoque temos, e quando comprar."
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      {estoque.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Nenhum produto cadastrado ainda. A liderança cadastra em Modo Liderança → Configuração → Material de Apoio.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {(["abaixo-minima", "perto-minima", "abaixo-objetivo", "ok", "acima-maxima", "sem-contagem"] as Faixa[])
              .filter((f) => contagemPorFaixa(f) > 0)
              .map((f) => (
                <span key={f} className="rounded-lg bg-white px-3 py-1.5 text-slate-700 ring-1 ring-slate-200">
                  {FAIXAS[f].rotulo}: {contagemPorFaixa(f)}
                </span>
              ))}
          </div>

          <ul className="space-y-3">
            {ordenado.map((item) => (
              <CartaoEstoque key={item.produto.id} item={item} />
            ))}
          </ul>

          {podeContar && (
            <FormContagem
              hoje={hoje}
              produtos={estoque.map(({ produto: p }) => ({
                id: p.id,
                nome: p.nome,
                unidade: p.unidade,
                linear_quantidade: p.linear_quantidade,
                linear_periodo: p.linear_periodo,
                politica_minima_dias: p.politica_minima_dias,
                politica_objetivo_dias: p.politica_objetivo_dias,
                politica_maxima_dias: p.politica_maxima_dias,
                antecedencia_alerta_dias: p.antecedencia_alerta_dias,
              }))}
            />
          )}

          {lotes.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Contagens recentes</h2>
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
