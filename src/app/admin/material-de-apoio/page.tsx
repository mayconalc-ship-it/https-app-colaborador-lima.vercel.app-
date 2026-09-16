import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { CartaoEstoque } from "@/components/material-apoio/CartaoEstoque";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinatariosDoAlerta, lerEstoque } from "@/lib/material-apoio-server";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { formatarLinear, formatarQuantidade, formatarReais } from "@/lib/material-apoio";
import { decodificar } from "@/lib/texto-url";
import { FormProduto } from "./FormProduto";
import { Destinatarios } from "./Destinatarios";
import { alternarProduto, excluirContagem, excluirProduto } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminMaterialDeApoioPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("material-apoio", "ver");
  const sp = await searchParams;
  // Os botões aparecem só para quem a ação do servidor deixaria passar.
  const [podeEditar, podeExcluir] = await Promise.all([
    podeNoModulo("material-apoio", "editar"),
    podeNoModulo("material-apoio", "excluir"),
  ]);
  const revendaId = await exigirRevenda("/admin");

  const admin = createAdminClient();
  const [estoque, marcados, { data: vinculos }, { data: recentes }, { data: contados }] = await Promise.all([
    lerEstoque(revendaId, { incluirInativos: true }),
    destinatariosDoAlerta(revendaId),
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
    admin
      .from("ma_contagens")
      .select("lote_id, produto_id, quantidade, contado_em, colaborador_nome")
      .eq("revenda_id", revendaId)
      .order("contado_em", { ascending: false })
      .limit(150),
    admin.from("ma_contagens").select("produto_id").eq("revenda_id", revendaId).limit(1000),
  ]);

  // As pessoas da revenda, para escolher quem recebe o alerta. Em lotes: a
  // lista de ids vai na URL da consulta.
  const ids = [...new Set((vinculos ?? []).map((v) => String(v.colaborador_id)))];
  const pessoas: { id: string; nome: string; cargo: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from("profiles").select("id, nome, cargo").in("id", ids.slice(i, i + 150));
    for (const p of data ?? []) pessoas.push({ id: String(p.id), nome: String(p.nome), cargo: p.cargo });
  }
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeDaPessoa = new Map(pessoas.map((p) => [p.id, p.nome]));

  const comContagem = new Set((contados ?? []).map((c) => String(c.produto_id)));
  const produtoDo = new Map(estoque.map((i) => [i.produto.id, i.produto]));

  const lotes: { id: string; contado_em: string; quem: string; itens: string[] }[] = [];
  for (const c of recentes ?? []) {
    let lote = lotes.find((l) => l.id === c.lote_id);
    if (!lote) {
      if (lotes.length >= 15) continue;
      lote = { id: String(c.lote_id), contado_em: String(c.contado_em), quem: String(c.colaborador_nome), itens: [] };
      lotes.push(lote);
    }
    const p = produtoDo.get(String(c.produto_id));
    if (p) lote.itens.push(`${p.nome} ${formatarQuantidade(Number(c.quantidade), p.unidade)}`);
  }

  const ativos = estoque.filter((i) => i.produto.ativo);

  return (
    <div>
      <PageHeader
        title="Material de Apoio"
        subtitle="Produtos, linear de uso, políticas de estoque e quem recebe o alerta de compra"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>}

      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Situação hoje</h2>
            <Link href="/material-de-apoio" className="text-sm font-semibold text-primary underline">
              Abrir a contagem →
            </Link>
          </div>
          {ativos.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum produto ativo. Cadastre abaixo.</p>
          ) : (
            <ul className="space-y-3">
              {ativos.map((item) => (
                <CartaoEstoque key={item.produto.id} item={item} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-500">Produtos ({estoque.length})</h2>
          <ul className="space-y-2">
            {estoque.map(({ produto: p }) => (
              <li key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 p-4">
                    <span className="font-semibold text-slate-900">
                      {p.nome}
                      {!p.ativo && <span className="ml-2 text-xs font-medium text-slate-400">(desativado)</span>}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {formatarLinear(p)} · mín {p.politica_minima_dias} · obj {p.politica_objetivo_dias} · máx{" "}
                      {p.politica_maxima_dias} dias
                      {p.valor_unitario != null ? ` · ${formatarReais(p.valor_unitario)}/${p.unidade}` : " · sem valor"}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-4">
                    {podeEditar ? (
                      <FormProduto inicial={p} />
                    ) : (
                      <p className="text-sm text-slate-500">Você pode ver o cadastro, mas não alterar.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {podeEditar && (
                        <BotaoExcluir
                          action={alternarProduto}
                          campos={{ id: p.id, ativo: String(!p.ativo) }}
                          confirmacao={
                            p.ativo
                              ? `Desativar “${p.nome}”? Ele sai da contagem e do alerta; o histórico continua.`
                              : `Reativar “${p.nome}”?`
                          }
                          rotuloConfirmar={p.ativo ? "Desativar" : "Reativar"}
                          perigo={false}
                          textoEnviando="Salvando..."
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {p.ativo ? "Desativar" : "Reativar"}
                        </BotaoExcluir>
                      )}
                      {podeExcluir && !comContagem.has(p.id) && (
                        <BotaoExcluir
                          action={excluirProduto}
                          campos={{ id: p.id }}
                          confirmacao={`Apagar “${p.nome}”? Ele nunca foi contado.`}
                        >
                          Apagar
                        </BotaoExcluir>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>

          {podeEditar && (
            <div className="rounded-2xl border border-primary/30 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold text-slate-800">➕ Novo produto</p>
              <FormProduto />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-500">Quem recebe o alerta de compra</h2>
          <p className="text-xs text-slate-500">
            Recebem no sino e no celular quando um produto chega perto da política mínima ou passa dela, com a
            quantidade sugerida para comprar. Quem recebe consegue abrir a tela de estoque mesmo sem o módulo liberado.
          </p>
          {podeEditar ? (
            <Destinatarios pessoas={pessoas} marcados={marcados} />
          ) : marcados.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ninguém recebe o alerta ainda.</p>
          ) : (
            <p className="text-sm text-slate-700">{marcados.map((id) => nomeDaPessoa.get(id) ?? "—").join(", ")}</p>
          )}
        </section>

        {lotes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-slate-500">Contagens recentes</h2>
            <ul className="space-y-2">
              {lotes.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {formatarDataHora(l.contado_em)} · {l.quem}
                    </p>
                    <p className="mt-1 text-slate-800">{l.itens.join(" · ")}</p>
                  </div>
                  {podeExcluir && (
                    <BotaoExcluir
                      action={excluirContagem}
                      campos={{ lote_id: l.id }}
                      confirmacao="Apagar esta contagem inteira? Use só para lançamento feito por engano."
                    >
                      Apagar
                    </BotaoExcluir>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
