"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";

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
) {
  const extensao = (arquivo.name.split(".").pop() ?? "png").toLowerCase();
  const caminho = `${pasta}/${Date.now()}.${extensao}`;

  const { error } = await admin.storage
    .from("conteudo")
    .upload(caminho, arquivo, { upsert: true });

  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("conteudo").getPublicUrl(caminho);
  return { url: data.publicUrl, extensao };
}

export async function enviarSonhoDaRevenda(formData: FormData) {
  await requireModulo("sonho", "criar");

  const anoStr = formData.get("ano") as string;
  const ano = Number(anoStr);
  const frase = ((formData.get("frase") as string) || "").trim() || null;
  const arquivo = formData.get("arquivo") as File | null;
  const quadro = formData.get("quadro") as File | null;

  if (!ano) {
    redirect("/admin/sonho-da-revenda?erro=Informe+o+ano");
  }

  const admin = createAdminClient();

  const { data: existente } = await admin
    .from("sonho_revenda")
    .select("tipo, arquivo_url, quadro_indicadores_url")
    .eq("ano", ano)
    .maybeSingle();

  if ((!arquivo || arquivo.size === 0) && !existente) {
    redirect(
      "/admin/sonho-da-revenda?erro=Selecione+a+imagem+ou+apresentação+do+sonho",
    );
  }

  let tipo = existente?.tipo;
  let arquivoUrl = existente?.arquivo_url;
  // Guarda os arquivos substituidos para apagar depois que o banco confirmar
  const substituidos: (string | null | undefined)[] = [];

  if (arquivo && arquivo.size > 0) {
    try {
      const resultado = await enviarArquivo(admin, arquivo, "sonho-revenda");
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
      redirect(
        `/admin/sonho-da-revenda?erro=${encodeURIComponent((e as Error).message)}`,
      );
    }
  }

  let quadroUrl = existente?.quadro_indicadores_url ?? null;

  if (quadro && quadro.size > 0) {
    try {
      const resultado = await enviarArquivo(
        admin,
        quadro,
        "sonho-revenda-indicadores",
      );
      if (existente?.quadro_indicadores_url) {
        substituidos.push(existente.quadro_indicadores_url);
      }
      quadroUrl = resultado.url;
    } catch (e) {
      redirect(
        `/admin/sonho-da-revenda?erro=${encodeURIComponent((e as Error).message)}`,
      );
    }
  }

  const { error: upsertError } = await admin.from("sonho_revenda").upsert(
    {
      ano,
      titulo: `Sonho da Revenda ${ano}`,
      frase,
      tipo,
      arquivo_url: arquivoUrl,
      quadro_indicadores_url: quadroUrl,
      ativo: true,
    },
    { onConflict: "ano" },
  );

  if (upsertError) {
    redirect(
      `/admin/sonho-da-revenda?erro=${encodeURIComponent(upsertError.message)}`,
    );
  }

  await apagarDoStorage(admin, ...substituidos);

  await criarNotificacao({
    modulo: "sonho",
    tipo: "importante",
    titulo: "Sonho da Revenda atualizado",
    mensagem: frase ?? `Confira o nosso alvo de ${ano}.`,
    url: "/sonho-da-revenda",
  });

  revalidatePath("/sonho-da-revenda");
  redirect(`/admin/sonho-da-revenda?ano=${ano}&sucesso=Salvo+com+sucesso`);
}

export async function excluirSonhoDaRevenda(formData: FormData) {
  await requireModulo("sonho", "excluir");

  const ano = Number(formData.get("ano"));
  if (!ano) redirect("/admin/sonho-da-revenda?erro=Ano+invalido");

  const admin = createAdminClient();

  const { data: registro } = await admin
    .from("sonho_revenda")
    .select("arquivo_url, quadro_indicadores_url")
    .eq("ano", ano)
    .maybeSingle();

  const { error } = await admin.from("sonho_revenda").delete().eq("ano", ano);

  if (error) {
    redirect(
      `/admin/sonho-da-revenda?ano=${ano}&erro=${encodeURIComponent(error.message)}`,
    );
  }

  await apagarDoStorage(
    admin,
    registro?.arquivo_url,
    registro?.quadro_indicadores_url,
  );

  revalidatePath("/sonho-da-revenda");
  redirect(`/admin/sonho-da-revenda?ano=${ano}&sucesso=Sonho+excluido`);
}

export async function removerQuadroIndicadores(formData: FormData) {
  await requireModulo("sonho", "editar");

  const ano = Number(formData.get("ano"));
  if (!ano) redirect("/admin/sonho-da-revenda?erro=Ano+invalido");

  const admin = createAdminClient();

  const { data: registro } = await admin
    .from("sonho_revenda")
    .select("quadro_indicadores_url")
    .eq("ano", ano)
    .maybeSingle();

  const { error } = await admin
    .from("sonho_revenda")
    .update({ quadro_indicadores_url: null })
    .eq("ano", ano);

  if (error) {
    redirect(
      `/admin/sonho-da-revenda?ano=${ano}&erro=${encodeURIComponent(error.message)}`,
    );
  }

  await apagarDoStorage(admin, registro?.quadro_indicadores_url);

  revalidatePath("/sonho-da-revenda");
  redirect(`/admin/sonho-da-revenda?ano=${ano}&sucesso=Quadro+removido`);
}
