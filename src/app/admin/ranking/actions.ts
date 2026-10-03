"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import {
  ehTimeValido,
  normalizarCategoria,
  type TimeRanking,
} from "@/lib/ranking-categorias";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";
import { noLugar, pararComErro, pararComSucesso, type ResultadoAcao } from "@/lib/resultado-acao";


function formatarMesCurto(mesAno: string) {
  const [ano, mes] = mesAno.split("-");
  return `${mes}/${ano}`;
}

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

export async function enviarRanking(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("ranking", "criar");

    const arquivo = formData.get("arquivo") as File | null;
    const mesAno = formData.get("mes_ano") as string;
    const time = formData.get("time") as TimeRanking;
    // A categoria e digitada: o nome da premiacao muda de mes para mes.
    const categoria = normalizarCategoria(
      (formData.get("categoria") as string) ?? "",
    );

    // Time e mês continuam selecionados no formulário (ele não sai do
    // lugar): quem esqueceu a foto só escolhe o arquivo e envia de novo.

    if (!time || !ehTimeValido(time)) {
      pararComErro("Selecione o time");
    }
    if (!arquivo || arquivo.size === 0) {
      pararComErro("Selecione uma imagem");
    }
    if (!mesAno) {
      pararComErro("Informe o mês");
    }
    if (!categoria) {
      pararComErro("Informe o nome da categoria");
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
      .upload(caminho, arquivo, {
        upsert: true,
        cacheControl: SEGUNDOS_DE_CACHE,
      });

    if (uploadError) {
      pararComErro(uploadError.message);
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
      pararComErro(upsertError.message);
    }

    if (anterior?.imagem_url) {
      const antigo = caminhoDoStorage(anterior.imagem_url);
      if (antigo) await admin.storage.from("conteudo").remove([antigo]);
    }

    // Agrupa: subir as categorias do mês gera UM aviso, não um por foto.
    await criarOuAgrupar({
      modulo: "ranking",
      titulo: "Ranking da Super Matinal!",
      mensagem: `Saiu o resultado de ${mesAno}. Confira quem ganhou.`,
      url: `/ranking?mes=${encodeURIComponent(mesAno)}`,
    });

    revalidatePath("/ranking");
    // O aviso repete o que acabou de entrar: é a conferência de quem lança
    // dez categorias seguidas sem olhar a lista de baixo.
    pararComSucesso(`Foto enviada — ${time} · ${categoria} · ${formatarMesCurto(mesAno)}`);
  });
}

export async function excluirRanking(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("ranking", "excluir");

    const id = Number(formData.get("id"));
    if (!id) pararComErro("Registro invalido");

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
      pararComErro(error.message);
    }

    if (registro?.imagem_url) {
      const caminho = caminhoDoStorage(registro.imagem_url);
      if (caminho) await admin.storage.from("conteudo").remove([caminho]);
    }

    revalidatePath("/ranking");
    pararComSucesso("Foto excluida");
  });
}

export async function atualizarRanking(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("ranking", "editar");

    const id = Number(formData.get("id"));
    const mesAno = formData.get("mes_ano") as string;
    const time = formData.get("time") as string;
    const categoria = normalizarCategoria(
      (formData.get("categoria") as string) ?? "",
    );

    if (!id) pararComErro("Registro invalido");
    if (!mesAno) pararComErro("Informe o mes");
    if (!time || !ehTimeValido(time)) {
      pararComErro("Selecione o time");
    }
    if (!categoria) {
      pararComErro("Informe o nome da categoria");
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
      pararComErro(msg);
    }

    revalidatePath("/ranking");
    pararComSucesso("Alteracoes salvas");
  });
}
