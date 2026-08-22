"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehModuloValido, MODULOS } from "@/lib/acessos";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`/admin/revendas?${chave}=${encodeURIComponent(mensagem)}`);
}

function campo(formData: FormData, nome: string) {
  return ((formData.get(nome) as string) || "").trim();
}

/**
 * Vira o nome numa chave estável: "Revenda Lima Barreiras" -> "barreiras".
 *
 * O slug é o que aparece em pasta de arquivo e em endereço, então não pode
 * ter acento nem espaço -- e não pode mudar quando alguém corrigir o nome.
 */
function slugificar(nome: string) {
  return nome
    .normalize("NFD")
    // Depois do NFD o acento vira uma marca solta; \p{M} pega todas elas
    // sem precisar escrever a faixa de caracteres na mão.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^revenda\s+lima\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function criarRevenda(formData: FormData) {
  const eu = await requireOwner();

  const nome = campo(formData, "nome");
  if (nome.length < 3) voltar("erro", "Informe o nome da revenda.");

  const slug = slugificar(nome);
  if (!slug) voltar("erro", "Não consegui gerar um identificador para esse nome.");

  const admin = createAdminClient();

  const { data: jaExiste } = await admin
    .from("revendas")
    .select("nome")
    .eq("slug", slug)
    .maybeSingle();

  if (jaExiste) voltar("erro", `Já existe uma revenda com esse nome (${jaExiste.nome}).`);

  const { error } = await admin.from("revendas").insert({ nome, slug });
  if (error) voltar("erro", error.message);

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: "Criou revenda",
    detalhes: nome,
  });

  voltar(
    "sucesso",
    `${nome} criada. Ligue os módulos que ela vai usar e vincule os colaboradores.`,
  );
}

export async function renomearRevenda(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  const nome = campo(formData, "nome");

  if (!id) voltar("erro", "Revenda inválida.");
  if (nome.length < 3) voltar("erro", "O nome não pode ficar vazio.");

  const admin = createAdminClient();
  // O slug não acompanha: ele já está gravado em vínculo e em caminho de
  // arquivo. Renomear é para corrigir o rótulo, não para trocar a chave.
  const { error } = await admin.from("revendas").update({ nome }).eq("id", id);
  if (error) voltar("erro", error.message);

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: "Renomeou revenda",
    detalhes: nome,
  });

  voltar("sucesso", `Revenda renomeada para ${nome}.`);
}

/**
 * Liga e desliga a revenda inteira.
 *
 * Desativar não apaga nada: os dados continuam lá e quem estava vinculado
 * simplesmente deixa de ver aquela revenda na lista. É a saída para uma
 * unidade que fecha ou que ainda não entrou no ar, sem perder histórico.
 */
export async function alternarRevenda(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  const ativa = campo(formData, "ativa") === "1";
  if (!id) voltar("erro", "Revenda inválida.");

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("revendas")
    .select("nome")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar("erro", "Revenda não encontrada.");

  const { error } = await admin.from("revendas").update({ ativa }).eq("id", id);
  if (error) voltar("erro", error.message);

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: ativa ? "Ativou revenda" : "Desativou revenda",
    detalhes: alvo.nome,
  });

  voltar(
    "sucesso",
    ativa
      ? `${alvo.nome} ativada.`
      : `${alvo.nome} desativada. Os dados continuam guardados.`,
  );
}

/* ================================================================== */
/* Logo da empresa                                                     */
/* ================================================================== */

const TAMANHO_MAXIMO_LOGO = 2 * 1024 * 1024;
const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Sobe a logo da empresa, que aparece no cabeçalho do app.
 *
 * A marca do APP (o "C") não muda: ela é o ícone instalado no celular e a
 * identidade da ferramenta. O que sobe aqui é a marca de QUEM usa, e é
 * por isso que ela é conteúdo de revenda, e não arquivo no repositório --
 * com mais de uma unidade, gravar uma logo no código passou a significar
 * mostrar a empresa errada para alguém.
 *
 * PNG com fundo transparente é o que fica melhor: o cabeçalho é azul, e
 * logo com fundo branco vira um retângulo colado ali. Por isso o aviso na
 * tela, e por isso o SVG é aceito.
 */
export async function salvarLogoRevenda(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  if (!id) voltar("erro", "Revenda inválida.");

  const arquivo = formData.get("logo") as File | null;
  if (!arquivo || arquivo.size === 0) voltar("erro", "Escolha um arquivo de imagem.");

  if (arquivo.size > TAMANHO_MAXIMO_LOGO) {
    voltar("erro", "A imagem passa de 2 MB. Uma logo não precisa ser tão grande.");
  }
  if (arquivo.type && !TIPOS_LOGO.includes(arquivo.type)) {
    voltar("erro", "Envie PNG, JPG, WEBP ou SVG.");
  }

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("revendas")
    .select("nome, logo_url")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar("erro", "Revenda não encontrada.");

  const extensao = (arquivo.name.split(".").pop() ?? "png")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);

  // O carimbo de hora no nome é o que faz a troca aparecer na hora: sem
  // ele o navegador e o CDN continuariam servindo a logo antiga.
  const caminho = `${id}/marca/logo-${Date.now()}.${extensao || "png"}`;

  const { error: erroUpload } = await admin.storage
    .from("conteudo")
    .upload(caminho, arquivo, {
      contentType: arquivo.type || "image/png",
      upsert: true,
    });

  if (erroUpload) voltar("erro", `Falha ao enviar: ${erroUpload.message}`);

  const { data: publica } = admin.storage.from("conteudo").getPublicUrl(caminho);

  const { error } = await admin
    .from("revendas")
    .update({ logo_url: publica.publicUrl })
    .eq("id", id);

  if (error) voltar("erro", error.message);

  await apagarLogoAntiga(alvo.logo_url);

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: "Trocou a logo da revenda",
    detalhes: alvo.nome,
    revenda_id: id,
  });

  voltar("sucesso", `Logo de ${alvo.nome} atualizada.`);
}

/** Volta para a marca do app, sem logo de empresa nenhuma. */
export async function removerLogoRevenda(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  if (!id) voltar("erro", "Revenda inválida.");

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("revendas")
    .select("nome, logo_url")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar("erro", "Revenda não encontrada.");

  const { error } = await admin
    .from("revendas")
    .update({ logo_url: null })
    .eq("id", id);

  if (error) voltar("erro", error.message);

  await apagarLogoAntiga(alvo.logo_url);

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: "Removeu a logo da revenda",
    detalhes: alvo.nome,
    revenda_id: id,
  });

  voltar("sucesso", `${alvo.nome} voltou a usar a marca do app.`);
}

/**
 * Apaga o arquivo que ninguém mais aponta.
 *
 * Falha calada: a coluna já foi atualizada, e um arquivo órfão no bucket
 * é bem menos grave do que uma tela de erro depois de a troca ter dado
 * certo.
 */
async function apagarLogoAntiga(url: string | null) {
  if (!url) return;

  const marca = "/conteudo/";
  const corte = url.indexOf(marca);
  if (corte === -1) return;

  const caminho = url.slice(corte + marca.length).split("?")[0];
  if (!caminho) return;

  try {
    await createAdminClient().storage.from("conteudo").remove([caminho]);
  } catch {
    // silêncio proposital
  }
}

/**
 * Salva de uma vez quais módulos a revenda usa.
 *
 * Apaga e regrava, igual à matriz de permissões: são 13 linhas por revenda,
 * e calcular diferença custaria mais em código do que economiza em banco.
 */
export async function salvarModulos(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  if (!id) voltar("erro", "Revenda inválida.");

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("revendas")
    .select("nome")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar("erro", "Revenda não encontrada.");

  const marcados = formData
    .getAll("modulo")
    .map(String)
    .filter((m) => ehModuloValido(m));

  await admin.from("revenda_modulos").delete().eq("revenda_id", id);

  if (marcados.length > 0) {
    const { error } = await admin.from("revenda_modulos").insert(
      marcados.map((modulo) => ({ revenda_id: id, modulo, ativo: true })),
    );
    if (error) voltar("erro", error.message);
  }

  const resumo = marcados
    .map((m) => MODULOS.find((x) => x.id === m)?.rotulo ?? m)
    .join(", ");

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao: "Alterou módulos da revenda",
    detalhes: `${alvo.nome}: ${resumo || "nenhum módulo"}`,
    revenda_id: id,
  });

  voltar("sucesso", `Módulos de ${alvo.nome} atualizados.`);
}
