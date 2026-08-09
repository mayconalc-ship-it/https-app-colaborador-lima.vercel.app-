"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { ehEditoriaValida } from "@/lib/comunicados";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) || "").trim();
}

export async function salvarComunicado(formData: FormData) {
  const id = formData.get("id") ? Number(formData.get("id")) : null;

  // O mesmo formulário publica matéria nova e altera existente. Sem separar
  // aqui, quem tivesse só "Criar" não conseguiria publicar nada, e quem
  // tivesse só "Editar" poderia publicar -- o oposto do esperado.
  const admin_ = await requireModulo("comunicados", id ? "editar" : "criar");

  const titulo = texto(formData, "titulo");
  const resumo = texto(formData, "resumo");
  const corpo = texto(formData, "texto");
  const categoria = texto(formData, "categoria");
  const data = texto(formData, "data");
  const destaque = formData.get("destaque") === "on";
  const imagem = formData.get("imagem") as File | null;

  if (!titulo) redirect("/admin/comunicados?erro=Informe+o+título");
  if (!corpo) redirect("/admin/comunicados?erro=Escreva+o+conteúdo");
  if (!ehEditoriaValida(categoria)) {
    redirect("/admin/comunicados?erro=Editoria+inválida");
  }

  const admin = createAdminClient();

  let imagemUrl: string | null | undefined = undefined;
  if (imagem && imagem.size > 0) {
    const extensao = (imagem.name.split(".").pop() ?? "jpg").toLowerCase();
    const caminho = `comunicados/${Date.now()}.${extensao}`;
    const { error: uploadError } = await admin.storage
      .from("conteudo")
      .upload(caminho, imagem, { upsert: true });

    if (uploadError) {
      redirect(
        `/admin/comunicados?erro=${encodeURIComponent(uploadError.message)}`,
      );
    }
    const { data: pub } = admin.storage.from("conteudo").getPublicUrl(caminho);
    imagemUrl = pub.publicUrl;
  }

  // Só uma matéria pode ser capa por vez.
  if (destaque) {
    await admin
      .from("comunicados")
      .update({ destaque: false })
      .neq("id", id ?? -1);
  }

  const registro = {
    titulo,
    resumo: resumo || null,
    texto: corpo,
    categoria,
    destaque,
    autor: admin_.nome,
    data: data || new Date().toISOString().slice(0, 10),
    ...(imagemUrl !== undefined ? { imagem_url: imagemUrl } : {}),
  };

  const { error } = id
    ? await admin.from("comunicados").update(registro).eq("id", id)
    : await admin.from("comunicados").insert(registro);

  if (error) {
    redirect(`/admin/comunicados?erro=${encodeURIComponent(error.message)}`);
  }

  if (!id) {
    await criarOuAgrupar({
      modulo: "comunicados",
      titulo: "Novidade no Jornal!",
      mensagem: titulo,
      url: "/comunicados",
      criadoPor: admin_.id,
    });
  }

  revalidatePath("/comunicados");
  redirect(
    `/admin/comunicados?sucesso=${id ? "Comunicado+atualizado" : "Comunicado+publicado"}`,
  );
}

export async function excluirComunicado(formData: FormData) {
  await requireModulo("comunicados", "excluir");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/comunicados?erro=Registro+inválido");

  const admin = createAdminClient();

  const { data: registro } = await admin
    .from("comunicados")
    .select("imagem_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("comunicados").delete().eq("id", id);

  if (error) {
    redirect(`/admin/comunicados?erro=${encodeURIComponent(error.message)}`);
  }

  if (registro?.imagem_url) {
    const caminho = caminhoDoStorage(registro.imagem_url);
    if (caminho) await admin.storage.from("conteudo").remove([caminho]);
  }

  revalidatePath("/comunicados");
  redirect("/admin/comunicados?sucesso=Comunicado+excluído");
}
