"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { MENU_PADRAO } from "@/lib/menu";

async function garantirSemeado(admin: ReturnType<typeof createAdminClient>) {
  const { count } = await admin
    .from("menu_itens")
    .select("*", { count: "exact", head: true });

  if (!count) {
    await admin.from("menu_itens").insert(MENU_PADRAO);
  }
}

export async function moverItem(formData: FormData) {
  await requireModulo("menu", "editar");

  const chave = formData.get("chave") as string;
  const direcao = formData.get("direcao") as "cima" | "baixo";

  const admin = createAdminClient();
  await garantirSemeado(admin);

  const { data: itens } = await admin
    .from("menu_itens")
    .select("chave, ordem")
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
  await admin.from("menu_itens").update({ ordem: -1 }).eq("chave", atual.chave);
  await admin
    .from("menu_itens")
    .update({ ordem: atual.ordem })
    .eq("chave", vizinho.chave);
  await admin
    .from("menu_itens")
    .update({ ordem: vizinho.ordem })
    .eq("chave", atual.chave);

  revalidatePath("/");
  redirect("/admin/menu?sucesso=Ordem+atualizada");
}

export async function alternarVisibilidade(formData: FormData) {
  await requireModulo("menu", "editar");

  const chave = formData.get("chave") as string;
  const visivelAtual = formData.get("visivel") === "true";

  const admin = createAdminClient();
  await garantirSemeado(admin);

  const { error } = await admin
    .from("menu_itens")
    .update({ visivel: !visivelAtual })
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
  await garantirSemeado(admin);

  const { error } = await admin
    .from("menu_itens")
    .update({ titulo, emoji: emoji || "📌" })
    .eq("chave", chave);

  if (error) {
    redirect(`/admin/menu?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/admin/menu?sucesso=Item+atualizado");
}
