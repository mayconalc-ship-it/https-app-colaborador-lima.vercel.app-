import { redirect } from "next/navigation";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { getRevendaAtiva } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { MenuItemRow } from "@/components/MenuItemRow";
import { completarComPadrao, type ItemMenu } from "@/lib/menu";
import { moverItem, alternarVisibilidade, renomearItem } from "./actions";

export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("menu", "ver");
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const revenda = await getRevendaAtiva();
  if (!revenda) redirect("/admin");

  const { data: existentes } = await admin
    .from("menu_itens")
    .select("chave, titulo, emoji, href, ordem, visivel")
    .eq("revenda_id", revenda.id)
    .order("ordem", { ascending: true });

  // Primeira visita DESTA REVENDA: popula com o menu padrão do app. E nas
  // seguintes, grava o que o padrão ganhou depois (10/09/2026): sem isso,
  // o cartão novo aparecia na home (completarComPadrao) mas não aqui, e não
  // havia como escondê-lo nem mudá-lo de lugar.
  const itens: ItemMenu[] = completarComPadrao(existentes);
  const tem = new Set((existentes ?? []).map((i) => i.chave));
  const faltando = itens.filter((i) => !tem.has(i.chave));
  if (faltando.length > 0) {
    await admin
      .from("menu_itens")
      .upsert(
        faltando.map((i) => ({ ...i, revenda_id: revenda.id })),
        { onConflict: "revenda_id,chave", ignoreDuplicates: true },
      );
  }

  return (
    <div>
      <PageHeader
        title="Ordem do Menu"
        subtitle="Defina a ordem, o nome e o que aparece para o colaborador"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {itens.map((item, indice) => (
          <MenuItemRow
            key={item.chave}
            item={item}
            primeiro={indice === 0}
            ultimo={indice === itens.length - 1}
            onMover={moverItem}
            onAlternar={alternarVisibilidade}
            onRenomear={renomearItem}
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Itens ocultos continuam funcionando pelo link direto, mas não aparecem
        na tela inicial do colaborador.
      </p>
    </div>
  );
}
