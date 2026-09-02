"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo } from "@/lib/require-admin";
import { idDaPasta } from "@/lib/drive-pasta";
import { fonteDe } from "@/lib/fontes-de-dados";

const ROTA = "/admin/fontes-de-dados";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

/**
 * Salva o link de UMA fonte.
 *
 * Uma action com mapa de tabelas, no lugar de quatro quase idênticas
 * (salvarPastaDeRating, salvarPastaDeRefugo, salvarPastaDeRotas e o
 * trecho da devolução). A tabela vem do catálogo, não do formulário: se
 * viesse do formulário, alguém poderia mandar gravar em qualquer tabela
 * do banco.
 *
 * A permissão herda a do MÓDULO -- quem já podia importar o Rating
 * continua sendo quem configura a fonte do Rating. Nenhuma permissão
 * nova foi criada para esta tela.
 */
export async function salvarFonte(formData: FormData) {
  const chave = String(formData.get("chave") ?? "");
  const fonte = fonteDe(chave);
  if (!fonte || !fonte.tabela) voltar("erro", "Fonte inválida.");

  if (!(await podeNoModulo(fonte.modulo as never, "criar"))) {
    voltar("erro", `Você não tem permissão para configurar a fonte de ${fonte.rotulo}.`);
  }

  const revendaId = await getRevendaId();
  if (!revendaId) voltar("erro", "Você não está em nenhuma revenda.");

  const link = String(formData.get("link") ?? "").trim();

  // O Refugo aceita vazio de propósito: sem link ele usa a mesma pasta do
  // Rating, que é o normal quando os relatórios chegam juntos.
  const aceitaVazio = fonte.chave === "refugo";
  if (!link && !aceitaVazio) {
    voltar("erro", `Informe o link da fonte de ${fonte.rotulo}.`);
  }

  const pasta = link ? idDaPasta(link) : null;
  if (link && !pasta) {
    voltar(
      "erro",
      "Não reconheci o link. Abra a pasta no Drive e copie o endereço da barra do navegador.",
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from(fonte.tabela).upsert(
    {
      revenda_id: revendaId,
      pasta_id: pasta,
      pasta_link: link || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );
  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath(fonte.telaDoModulo);
  voltar("sucesso", `Fonte de ${fonte.rotulo} atualizada.`);
}
