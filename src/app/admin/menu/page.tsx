import { redirect } from "next/navigation";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { getRevendaAtiva } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { MenuItemRow } from "@/components/MenuItemRow";
import { MENU_PADRAO, type ItemMenu } from "@/lib/menu";
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

  // Primeira visita DESTA REVENDA: popula com o menu padrão do app.
  let itens: ItemMenu[];
  if (!existentes || existentes.length === 0) {
    await admin
      .from("menu_itens")
      .insert(MENU_PADRAO.map((i) => ({ ...i, revenda_id: revenda.id })));
    itens = MENU_PADRAO;
  } else {
    itens = existentes;
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
