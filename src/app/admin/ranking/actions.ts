"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { CATEGORIAS_POR_TIME, type TimeRanking } from "@/lib/ranking-categorias";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

function categoriaValida(time: string, categoria: string) {
  if (!(time in CATEGORIAS_POR_TIME)) return false;
  const lista = CATEGORIAS_POR_TIME[time as TimeRanking] as readonly string[];
  return lista.includes(categoria);
}

export async function enviarRanking(formData: FormData) {
  await requireModulo("ranking", "criar");

  const arquivo = formData.get("arquivo") as File | null;
  const mesAno = formData.get("mes_ano") as string;
  const time = formData.get("time") as TimeRanking;
  const categoria = formData.get("categoria") as string;

  if (!arquivo || arquivo.size === 0) {
    redirect("/admin/ranking?erro=Selecione+uma+imagem");
  }
  if (!mesAno) {
    redirect("/admin/ranking?erro=Informe+o+mes");
  }
  if (!time || !(time in CATEGORIAS_POR_TIME)) {
    redirect("/admin/ranking?erro=Selecione+o+time");
  }
  if (!categoria || !categoriaValida(time, categoria)) {
    redirect("/admin/ranking?erro=Selecione+a+categoria");
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/ranking");

  // Se já existe foto para esse mês/time/categoria, apaga o arquivo antigo
  // do storage antes de substituir — senão ele ficaria órfão ocupando espaço.
  const { data: anterior } = await admin
    .from("ranking_matinal")
    .select("imagem_url")
    .eq("revenda_id", revendaId)
    .eq("mes_ano", mesAno)
    .eq("time", time)
    .eq("categoria", categoria)
    .maybeSingle();

  const extensao = (arquivo.name.split(".").pop() ?? "png").toLowerCase();
  const caminho = `${revendaId}/ranking/${mesAno}-${time}-${Date.now()}.${extensao}`;

  const { error: uploadError } = await admin.storage
    .from("conteudo")
    .upload(caminho, arquivo, { upsert: true });

  if (uploadError) {
    redirect(`/admin/ranking?erro=${encodeURIComponent(uploadError.message)}`);
  }

  const { data: publicUrlData } = admin.storage
    .from("conteudo")
    .getPublicUrl(caminho);

  const { error: upsertError } = await admin.from("ranking_matinal").upsert(
    {
      revenda_id: revendaId,
      mes_ano: mesAno,
      time,
      categoria,
      imagem_url: publicUrlData.publicUrl,
    },
    { onConflict: "revenda_id,mes_ano,time,categoria" },
  );

  if (upsertError) {
    redirect(`/admin/ranking?erro=${encodeURIComponent(upsertError.message)}`);
  }

  if (anterior?.imagem_url) {
    const antigo = caminhoDoStorage(anterior.imagem_url);
    if (antigo) await admin.storage.from("conteudo").remove([antigo]);
  }

  // Agrupa: subir as 11 categorias do mês gera UM aviso, não onze.
  await criarOuAgrupar({
    modulo: "ranking",
    titulo: "Ranking da Super Matinal!",
    mensagem: `Saiu o resultado de ${mesAno}. Confira quem ganhou.`,
    url: `/ranking?mes=${encodeURIComponent(mesAno)}`,
  });

  revalidatePath("/ranking");
  redirect("/admin/ranking?sucesso=Foto+enviada");
}

export async function excluirRanking(formData: FormData) {
  await requireModulo("ranking", "excluir");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/ranking?erro=Registro+invalido");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/ranking");

  const { data: registro } = await admin
    .from("ranking_matinal")
    .select("imagem_url")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const { error } = await admin
    .from("ranking_matinal")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) {
    redirect(`/admin/ranking?erro=${encodeURIComponent(error.message)}`);
  }

  if (registro?.imagem_url) {
    const caminho = caminhoDoStorage(registro.imagem_url);
    if (caminho) await admin.storage.from("conteudo").remove([caminho]);
  }

  revalidatePath("/ranking");
  redirect("/admin/ranking?sucesso=Foto+excluida");
}

export async function atualizarRanking(formData: FormData) {
  await requireModulo("ranking", "editar");

  const id = Number(formData.get("id"));
  const mesAno = formData.get("mes_ano") as string;
  const time = formData.get("time") as string;
  const categoria = formData.get("categoria") as string;

  if (!id) redirect("/admin/ranking?erro=Registro+invalido");
  if (!mesAno) redirect("/admin/ranking?erro=Informe+o+mes");
  if (!categoriaValida(time, categoria)) {
    redirect("/admin/ranking?erro=Time+ou+categoria+invalidos");
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/ranking");
  const { error } = await admin
    .from("ranking_matinal")
    .update({ mes_ano: mesAno, time, categoria })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) {
    const msg = error.message.includes("duplicate")
      ? "Já existe uma foto para esse mês, time e categoria"
      : error.message;
    redirect(`/admin/ranking?erro=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/ranking");
  redirect("/admin/ranking?sucesso=Alteracoes+salvas");
}
