"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo } from "@/lib/require-admin";
import { idDaPasta } from "@/lib/drive-pasta";
import { fonteDe, linkDeCanalValido } from "@/lib/fontes-de-dados";
import { voltarCom } from "@/lib/url-de-volta";
import { getPerfil } from "@/lib/sessao";

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

/**
 * Salva os dois canais do rodapé DESTA revenda, num botão só.
 *
 * Campo vazio é permitido e quer dizer "esta revenda não tem este canal":
 * o botão some do app. É o jeito de tirar um link errado sem precisar pôr
 * outro no lugar.
 */
export async function salvarCanais(formData: FormData) {
  const chave = "canais";

  if (!(await podeNoModulo("fontes-dados", "editar"))) {
    voltar("erro", "Você não tem permissão para trocar os links dos canais do rodapé.", chave);
  }

  const revendaId = await getRevendaId();
  if (!revendaId) voltar("erro", "Você não está em nenhuma revenda.", chave);

  const lido = (campo: string) => String(formData.get(campo) ?? "").trim();
  const epiBruto = lido("epi_url");
  const ouvidoriaBruto = lido("ouvidoria_url");
  const epi = epiBruto ? linkDeCanalValido(epiBruto) : null;
  const ouvidoria = ouvidoriaBruto ? linkDeCanalValido(ouvidoriaBruto) : null;

  if (epiBruto && !epi) {
    voltar("erro", "O link da Solicitação de EPI não é um endereço de site. Cole o link completo, começando com https://.", chave);
  }
  if (ouvidoriaBruto && !ouvidoria) {
    voltar("erro", "O link do Canal de Ouvidoria não é um endereço de site. Cole o link completo, começando com https://.", chave);
  }

  const perfil = await getPerfil();
  const admin = createAdminClient();
  const { error } = await admin.from("revenda_canais").upsert(
    {
      revenda_id: revendaId,
      epi_url: epi,
      ouvidoria_url: ouvidoria,
      atualizado_em: new Date().toISOString(),
      atualizado_por: perfil?.id ?? null,
    },
    { onConflict: "revenda_id" },
  );
  if (error) {
    const tabelaAusente = error.code === "42P01" || error.code === "PGRST205";
    voltar(
      "erro",
      tabelaAusente
        ? "A tabela dos canais ainda não existe: rode a migration 113 no Supabase e tente de novo."
        : `Não foi possível salvar: ${error.message}`,
      chave,
    );
  }

  // A tela inicial é onde o rodapé aparece.
  revalidatePath("/");
  revalidatePath(ROTA);

  const faltando = [!epi && "Solicitação de EPI", !ouvidoria && "Canal de Ouvidoria"].filter(Boolean);
  voltar(
    "sucesso",
    faltando.length === 0
      ? "Canais salvos. O rodapé do app já mostra os links novos."
      : `Canais salvos. Sem link, não aparece no app: ${faltando.join(" e ")}.`,
    chave,
  );
}
