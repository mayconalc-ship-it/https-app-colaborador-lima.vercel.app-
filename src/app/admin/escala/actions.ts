"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { AREAS, ehAreaValida } from "@/lib/areas";
import { exigirRevenda } from "@/lib/revendas";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

export async function salvarEscala(formData: FormData) {
  await requireModulo("escala", "editar");

  const area = formData.get("area") as string;
  const observacao = ((formData.get("observacao") as string) || "").trim();
  const arquivo = formData.get("arquivo") as File | null;

  if (!ehAreaValida(area)) redirect("/admin/escala?erro=Área+inválida");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/escala");

  const { data: atual } = await admin
    .from("escala_trabalho")
    .select("arquivo_url")
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .maybeSingle();

  let arquivoUrl = atual?.arquivo_url ?? null;
  let tipo: string | null = null;
  let anterior: string | null = null;

  if (arquivo && arquivo.size > 0) {
    const extensao = (arquivo.name.split(".").pop() ?? "pdf").toLowerCase();
    const caminho = `${revendaId}/escala/${area}-${Date.now()}.${extensao}`;

    const { error: uploadError } = await admin.storage
      .from("conteudo")
      .upload(caminho, arquivo, { upsert: true });

    if (uploadError) {
      redirect(`/admin/escala?erro=${encodeURIComponent(uploadError.message)}`);
    }

    const { data: pub } = admin.storage.from("conteudo").getPublicUrl(caminho);
    anterior = atual?.arquivo_url ?? null;
    arquivoUrl = pub.publicUrl;
    tipo = extensao;
  }

  // Upsert, e não update: a linha da área só existe depois que alguém
  // salva a escala pela primeira vez, e numa revenda nova ela não existe.
  // Um update simples não gravaria nada e a tela mentiria "salvo".
  const { error } = await admin.from("escala_trabalho").upsert(
    {
      revenda_id: revendaId,
      area,
      rotulo: AREAS.find((a) => a.id === area)?.rotulo ?? area,
      arquivo_url: arquivoUrl,
      ...(tipo ? { tipo } : {}),
      observacao: observacao || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,area" },
  );

  if (error) {
    redirect(`/admin/escala?erro=${encodeURIComponent(error.message)}`);
  }

  // Só apaga o arquivo antigo depois que o banco confirmou a troca.
  if (anterior) {
    const caminho = caminhoDoStorage(anterior);
    if (caminho) await admin.storage.from("conteudo").remove([caminho]);
  }

  await criarOuAgrupar({
    modulo: "escala",
    tipo: "atualizado",
    titulo: "Escala de trabalho atualizada",
    mensagem: `A escala de ${area} mudou. Confira a sua.`,
    url: "/escala",
  });

  revalidatePath("/escala");
  redirect("/admin/escala?sucesso=Escala+atualizada");
}

export async function removerEscala(formData: FormData) {
  await requireModulo("escala", "editar");

  const area = formData.get("area") as string;
  if (!ehAreaValida(area)) redirect("/admin/escala?erro=Área+inválida");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/escala");

  const { data: atual } = await admin
    .from("escala_trabalho")
    .select("arquivo_url")
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .maybeSingle();

  const { error } = await admin
    .from("escala_trabalho")
    .update({
      arquivo_url: null,
      tipo: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("revenda_id", revendaId)
    .eq("area", area);

  if (error) {
    redirect(`/admin/escala?erro=${encodeURIComponent(error.message)}`);
  }

  if (atual?.arquivo_url) {
    const caminho = caminhoDoStorage(atual.arquivo_url);
    if (caminho) await admin.storage.from("conteudo").remove([caminho]);
  }

  revalidatePath("/escala");
  redirect("/admin/escala?sucesso=Escala+removida");
}
