"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo } from "@/lib/require-admin";
import { idDaPasta } from "@/lib/drive-pasta";
import { fonteDe } from "@/lib/fontes-de-dados";
import { voltarCom } from "@/lib/url-de-volta";

const ROTA = "/admin/fontes-de-dados";

/**
 * Volta para a GAVETA de onde o clique saiu, e não para o topo da tela
 * (08/09/2026, pedido do dono: "caso haja interação em salvar, não mova a
 * tela pra cima, deixe onde ela está").
 *
 * O `?aberta=` reabre a gaveta -- o estado de tela morre no redirect -- e a
 * âncora `#fonte-<chave>` diz ao navegador onde parar a rolagem.
 */
function voltar(chave: "erro" | "sucesso", mensagem: string, fonte?: string): never {
  const destino = fonte ? `${ROTA}?aberta=${fonte}#fonte-${fonte}` : ROTA;
  redirect(voltarCom(destino, chave, mensagem));
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
    voltar("erro", `Você não tem permissão para configurar a fonte de ${fonte.rotulo}.`, chave);
  }

  const revendaId = await getRevendaId();
  if (!revendaId) voltar("erro", "Você não está em nenhuma revenda.", chave);

  const link = String(formData.get("link") ?? "").trim();

  // O Refugo aceita vazio de propósito: sem link ele usa a mesma pasta do
  // Rating, que é o normal quando os relatórios chegam juntos.
  const aceitaVazio = fonte.chave === "refugo";
  if (!link && !aceitaVazio) {
    voltar("erro", `Informe o link da fonte de ${fonte.rotulo}.`, chave);
  }

  const pasta = link ? idDaPasta(link) : null;
  if (link && !pasta) {
    voltar(
      "erro",
      "Não reconheci o link. Abra a pasta no Drive e copie o endereço da barra do navegador.",
      chave,
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
  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`, chave);

  revalidatePath(ROTA);
  revalidatePath(fonte.telaDoModulo);
  voltar("sucesso", `Fonte de ${fonte.rotulo} atualizada.`, chave);
}
