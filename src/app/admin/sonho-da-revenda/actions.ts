"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";
import { noLugar, pararComErro, pararComSucesso, type ResultadoAcao } from "@/lib/resultado-acao";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

async function apagarDoStorage(
  admin: ReturnType<typeof createAdminClient>,
  ...urls: (string | null | undefined)[]
) {
  const caminhos = urls
    .filter((u): u is string => Boolean(u))
    .map(caminhoDoStorage)
    .filter((c): c is string => Boolean(c));

  if (caminhos.length) {
    await admin.storage.from("conteudo").remove(caminhos);
  }
}

async function enviarArquivo(
  admin: ReturnType<typeof createAdminClient>,
  arquivo: File,
  pasta: string,
  revendaId: string,
) {
  const extensao = (arquivo.name.split(".").pop() ?? "png").toLowerCase();
  // A revenda na frente do caminho: o bucket é o mesmo para todas, e sem
  // isso os arquivos das unidades ficariam misturados na mesma pasta.
  const caminho = `${revendaId}/${pasta}/${Date.now()}.${extensao}`;

  const { error } = await admin.storage
    .from("conteudo")
    .upload(caminho, arquivo, {
      upsert: true,
      cacheControl: SEGUNDOS_DE_CACHE,
    });

  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("conteudo").getPublicUrl(caminho);
  return { url: data.publicUrl, extensao };
}

export async function enviarSonhoDaRevenda(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("sonho", "criar");

    const anoStr = formData.get("ano") as string;
    const ano = Number(anoStr);
    const frase = ((formData.get("frase") as string) || "").trim() || null;
    const arquivo = formData.get("arquivo") as File | null;
    const quadro = formData.get("quadro") as File | null;

    if (!ano) {
      pararComErro("Informe o ano");
    }

    const admin = createAdminClient();
    const revendaId = await exigirRevenda("/admin/sonho-da-revenda");

    const { data: existente } = await admin
      .from("sonho_revenda")
      .select("tipo, arquivo_url, quadro_indicadores_url")
      .eq("revenda_id", revendaId)
      .eq("ano", ano)
      .maybeSingle();

    if ((!arquivo || arquivo.size === 0) && !existente) {
      pararComErro("Selecione a imagem ou apresentação do sonho");
    }

    let tipo = existente?.tipo;
    let arquivoUrl = existente?.arquivo_url;
    // Guarda os arquivos substituidos para apagar depois que o banco confirmar
    const substituidos: (string | null | undefined)[] = [];

    if (arquivo && arquivo.size > 0) {
      try {
        const resultado = await enviarArquivo(
          admin,
          arquivo,
          "sonho-revenda",
          revendaId,
        );
        if (existente?.arquivo_url) substituidos.push(existente.arquivo_url);
        arquivoUrl = resultado.url;
        if (resultado.extensao === "pptx" || resultado.extensao === "ppt") {
          tipo = "pptx";
        } else if (resultado.extensao === "pdf") {
          tipo = "pdf";
        } else {
          tipo = "imagem";
        }
      } catch (e) {
        pararComErro((e as Error).message);
      }
    }

    let quadroUrl = existente?.quadro_indicadores_url ?? null;

    if (quadro && quadro.size > 0) {
      try {
        const resultado = await enviarArquivo(
          admin,
          quadro,
          "sonho-revenda-indicadores",
          revendaId,
        );
        if (existente?.quadro_indicadores_url) {
          substituidos.push(existente.quadro_indicadores_url);
        }
        quadroUrl = resultado.url;
      } catch (e) {
        pararComErro((e as Error).message);
      }
    }

    const { error: upsertError } = await admin.from("sonho_revenda").upsert(
      {
        revenda_id: revendaId,
        ano,
        titulo: `Sonho da Revenda ${ano}`,
        frase,
        tipo,
        arquivo_url: arquivoUrl,
        quadro_indicadores_url: quadroUrl,
        ativo: true,
      },
      { onConflict: "revenda_id,ano" },
    );

    if (upsertError) {
      pararComErro(upsertError.message);
    }

    await apagarDoStorage(admin, ...substituidos);

    await criarOuAgrupar({
      modulo: "sonho",
      tipo: "importante",
      titulo: "Sonho da Revenda atualizado",
      mensagem: frase ?? `Confira o nosso alvo de ${ano}.`,
      url: "/sonho-da-revenda",
    });

    revalidatePath("/sonho-da-revenda");
    pararComSucesso("Salvo com sucesso");
  });
}

export async function excluirSonhoDaRevenda(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("sonho", "excluir");

    const ano = Number(formData.get("ano"));
    if (!ano) pararComErro("Ano invalido");

    const admin = createAdminClient();
    const revendaId = await exigirRevenda("/admin/sonho-da-revenda");

    const { data: registro } = await admin
      .from("sonho_revenda")
      .select("arquivo_url, quadro_indicadores_url")
      .eq("revenda_id", revendaId)
      .eq("ano", ano)
      .maybeSingle();

    const { error } = await admin.from("sonho_revenda").delete().eq("revenda_id", revendaId)
      .eq("ano", ano);

    if (error) {
      pararComErro(error.message);
    }

    await apagarDoStorage(
      admin,
      registro?.arquivo_url,
      registro?.quadro_indicadores_url,
    );

    revalidatePath("/sonho-da-revenda");
    pararComSucesso("Sonho excluido");
  });
}

export async function removerQuadroIndicadores(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await requireModulo("sonho", "editar");

    const ano = Number(formData.get("ano"));
    if (!ano) pararComErro("Ano invalido");

    const admin = createAdminClient();
    const revendaId = await exigirRevenda("/admin/sonho-da-revenda");

    const { data: registro } = await admin
      .from("sonho_revenda")
      .select("quadro_indicadores_url")
      .eq("revenda_id", revendaId)
      .eq("ano", ano)
      .maybeSingle();

    const { error } = await admin
      .from("sonho_revenda")
      .update({ quadro_indicadores_url: null })
      .eq("revenda_id", revendaId)
      .eq("ano", ano);

    if (error) {
      pararComErro(error.message);
    }

    await apagarDoStorage(admin, registro?.quadro_indicadores_url);

    revalidatePath("/sonho-da-revenda");
    pararComSucesso("Quadro removido");
  });
}
