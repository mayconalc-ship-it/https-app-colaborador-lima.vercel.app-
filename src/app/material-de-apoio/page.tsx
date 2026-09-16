import { redirect } from "next/navigation";
import { TelaDoEstoque, type LoteRecente } from "@/components/material-apoio/TelaDoEstoque";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { lerEstoque, podeAbrirMaterialDeApoio } from "@/lib/material-apoio-server";
import { MODULO_MATERIAL_APOIO, formatarQuantidade, hojeSP } from "@/lib/material-apoio";
import { decodificar } from "@/lib/texto-url";

export const dynamic = "force-dynamic";

/** Lê o banco e entrega para a tela (TelaDoEstoque), que só apresenta. */
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

  // As conciliações recentes, uma por envio.
  const produtoDo = new Map(estoque.map((i) => [i.produto.id, i.produto]));
  const lotes: LoteRecente[] = [];
  for (const c of recentes ?? []) {
    let lote = lotes.find((l) => l.id === c.lote_id);
    if (!lote) {
      if (lotes.length >= 10) continue;
      lote = {
        id: String(c.lote_id),
        contado_em: String(c.contado_em),
        quem: String(c.colaborador_nome),
        observacao: c.observacao,
        itens: [],
      };
      lotes.push(lote);
    }
    const p = produtoDo.get(String(c.produto_id));
    if (p) lote.itens.push(`${p.nome} ${formatarQuantidade(Number(c.quantidade), p.unidade)}`);
  }

  return (
    <TelaDoEstoque
      estoque={estoque}
      podeContar={podeContar}
      hoje={hojeSP()}
      lotes={lotes}
      erro={sp.erro ? decodificar(sp.erro) : undefined}
      sucesso={sp.sucesso ? decodificar(sp.sucesso) : undefined}
    />
  );
}
