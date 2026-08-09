"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { MENU_PADRAO } from "@/lib/menu";

/**
 * Cada revenda tem o próprio menu, e o de uma revenda nova nasce vazio.
 * Em vez de semear pelo banco na migração, semeamos na primeira vez que
 * alguém abre a tela: assim uma revenda criada meses depois já ganha o
 * menu padrão sem ninguém precisar rodar SQL.
 */
async function garantirSemeado(
  admin: ReturnType<typeof createAdminClient>,
  revendaId: string,
) {
  const { count } = await admin
    .from("menu_itens")
    .select("*", { count: "exact", head: true })
    .eq("revenda_id", revendaId);

  if (!count) {
    await admin
      .from("menu_itens")
      .insert(MENU_PADRAO.map((i) => ({ ...i, revenda_id: revendaId })));
  }
}

/** Toda ação desta tela precisa saber em qual revenda está mexendo. */
async function revendaOuErro() {
  const revendaId = await getRevendaId();
  if (!revendaId) redirect("/admin/menu?erro=Voce+nao+esta+em+nenhuma+revenda");
  return revendaId;
}

export async function moverItem(formData: FormData) {
  await requireModulo("menu", "editar");

  const chave = formData.get("chave") as string;
  const direcao = formData.get("direcao") as "cima" | "baixo";

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  const { data: itens } = await admin
    .from("menu_itens")
    .select("chave, ordem")
    .eq("revenda_id", revendaId)
    .order("ordem", { ascending: true });

  if (!itens) redirect("/admin/menu?erro=Nao+foi+possivel+ler+o+menu");

  const indice = itens.findIndex((i) => i.chave === chave);
  const destino = direcao === "cima" ? indice - 1 : indice + 1;

  if (indice === -1 || destino < 0 || destino >= itens.length) {
    redirect("/admin/menu");
  }

  const atual = itens[indice];
  const vizinho = itens[destino];

  // Troca as posicoes usando um valor temporario, porque `ordem` pode ter
  // indice unico e uma troca direta geraria conflito momentaneo.
  await admin
    .from("menu_itens")
    .update({ ordem: -1 })
    .eq("revenda_id", revendaId)
    .eq("chave", atual.chave);
  await admin
    .from("menu_itens")
    .update({ ordem: atual.ordem })
    .eq("revenda_id", revendaId)
    .eq("chave", vizinho.chave);
  await admin
    .from("menu_itens")
    .update({ ordem: vizinho.ordem })
    .eq("revenda_id", revendaId)
    .eq("chave", atual.chave);

  revalidatePath("/");
  redirect("/admin/menu?sucesso=Ordem+atualizada");
}

export async function alternarVisibilidade(formData: FormData) {
  await requireModulo("menu", "editar");

  const chave = formData.get("chave") as string;
  const visivelAtual = formData.get("visivel") === "true";

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  const { error } = await admin
    .from("menu_itens")
    .update({ visivel: !visivelAtual })
    .eq("revenda_id", revendaId)
    .eq("chave", chave);

  if (error) {
    redirect(`/admin/menu?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/admin/menu?sucesso=Menu+atualizado");
}

export async function renomearItem(formData: FormData) {
  await requireModulo("menu", "editar");

  const chave = formData.get("chave") as string;
  const titulo = ((formData.get("titulo") as string) || "").trim();
  const emoji = ((formData.get("emoji") as string) || "").trim();

  if (!titulo) redirect("/admin/menu?erro=O+nome+nao+pode+ficar+vazio");

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  const { error } = await admin
    .from("menu_itens")
    .update({ titulo, emoji: emoji || "📌" })
    .eq("revenda_id", revendaId)
    .eq("chave", chave);

  if (error) {
    redirect(`/admin/menu?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/admin/menu?sucesso=Item+atualizado");
}
