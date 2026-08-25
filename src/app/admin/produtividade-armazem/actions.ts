"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { ehSenso, ehTurno } from "@/lib/produtividade-armazem";

const ROTA = "/admin/produtividade-armazem";

function erro(aba: string, mensagem: string): never {
  redirect(`${ROTA}?aba=${aba}&erro=${encodeURIComponent(mensagem)}`);
}

function sucesso(aba: string, mensagem: string): never {
  redirect(`${ROTA}?aba=${aba}&sucesso=${encodeURIComponent(mensagem)}`);
}

function numeroOuNulo(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Traduz violação de chave estrangeira (23503) numa mensagem que explica
 *  o que fazer, em vez do código do Postgres. Todo excluir passa por aqui. */
function erroDeExclusao(aba: string, mensagem: string): never {
  erro(
    aba,
    `Não é possível excluir: ${mensagem}. Já existem lançamentos usando este cadastro -- desative em vez de excluir.`,
  );
}

// -------------------- EMBALAGENS --------------------
export async function salvarEmbalagem(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("embalagens", "Informe o nome da embalagem.");

  const unidadeReepack = formData.get("unidade_reepack") === "pc" ? "pc" : "cx";

  const { error } = await admin.from("pa_embalagens").insert({
    revenda_id: revendaId,
    nome,
    unidade_reepack: unidadeReepack,
    litros_por_pacote: numeroOuNulo(formData.get("litros_por_pacote")),
    tempo_padrao_reepack_segundos: numeroOuNulo(formData.get("tempo_padrao_reepack_segundos")),
    tempo_padrao_despejo_segundos: numeroOuNulo(formData.get("tempo_padrao_despejo_segundos")),
    meta_reepacks_hora: numeroOuNulo(formData.get("meta_reepacks_hora")),
    meta_litros_hora: numeroOuNulo(formData.get("meta_litros_hora")),
  });
  if (error) erro("embalagens", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("embalagens", "Embalagem cadastrada");
}

export async function editarEmbalagem(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("embalagens", "Informe o nome da embalagem.");

  const unidadeReepack = formData.get("unidade_reepack") === "pc" ? "pc" : "cx";

  const { error } = await admin
    .from("pa_embalagens")
    .update({
      nome,
      unidade_reepack: unidadeReepack,
      litros_por_pacote: numeroOuNulo(formData.get("litros_por_pacote")),
      tempo_padrao_reepack_segundos: numeroOuNulo(formData.get("tempo_padrao_reepack_segundos")),
      tempo_padrao_despejo_segundos: numeroOuNulo(formData.get("tempo_padrao_despejo_segundos")),
      meta_reepacks_hora: numeroOuNulo(formData.get("meta_reepacks_hora")),
      meta_litros_hora: numeroOuNulo(formData.get("meta_litros_hora")),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("embalagens", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("embalagens", "Embalagem atualizada");
}

export async function excluirEmbalagem(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_embalagens").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("embalagens", "esta embalagem está em uso");
    erro("embalagens", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("embalagens", "Embalagem excluída");
}

export async function alternarEmbalagemAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_embalagens").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("embalagens", "Atualizado");
}

// -------------------- EMPILHADEIRAS --------------------
export async function salvarEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const numero = String(formData.get("numero") ?? "").trim();
  if (!numero) erro("empilhadeiras", "Informe o número da empilhadeira.");

  const { error } = await admin.from("pa_empilhadeiras").insert({ revenda_id: revendaId, numero });
  if (error) erro("empilhadeiras", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Empilhadeira cadastrada");
}

export async function editarEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const numero = String(formData.get("numero") ?? "").trim();
  if (!numero) erro("empilhadeiras", "Informe o número da empilhadeira.");

  const { error } = await admin
    .from("pa_empilhadeiras")
    .update({ numero })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("empilhadeiras", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Empilhadeira atualizada");
}

export async function excluirEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_empilhadeiras").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("empilhadeiras", "esta empilhadeira já tem histórico");
    erro("empilhadeiras", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Empilhadeira excluída");
}

export async function alternarEmpilhadeiraAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_empilhadeiras").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Atualizado");
}

// -------------------- LEMBRETE, POR EMPILHADEIRISTA --------------------
/** Pessoas da revenda cujo nome ou CPF batem com o termo -- alimenta a
 *  busca da tela de lembrete, pra não listar 160 nomes de uma vez. */
export async function buscarColaboradoresParaLembrete(termo: string) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  if (termo.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const ids = (vinculos ?? []).map((v) => v.colaborador_id);
  if (ids.length === 0) return [];

  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  let consulta = admin.from("profiles").select("id, nome, cargo").in("id", ids).limit(10);
  consulta = digitos ? consulta.or(`nome.ilike.%${t}%,cpf.ilike.%${digitos}%`) : consulta.ilike("nome", `%${t}%`);
  const { data } = await consulta;
  return data ?? [];
}

export async function salvarLembreteEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const operadorId = String(formData.get("operador_id") ?? "");
  const operadorNome = String(formData.get("operador_nome") ?? "").trim();
  const turno = formData.get("turno");
  if (!operadorId || !operadorNome) erro("empilhadeiras", "Escolha o empilhadeirista pela busca.");
  if (!ehTurno(turno)) erro("empilhadeiras", "Escolha o turno.");

  const { error } = await admin.from("pa_empilhadeira_lembretes").upsert(
    { revenda_id: revendaId, operador_id: operadorId, operador_nome: operadorNome, turno, ativo: true },
    { onConflict: "operador_id,turno" },
  );
  if (error) erro("empilhadeiras", `Não foi possível salvar o lembrete: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Lembrete cadastrado");
}

export async function excluirLembreteEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  await admin.from("pa_empilhadeira_lembretes").delete().eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Lembrete excluído");
}

// -------------------- FÁBRICAS / TRANSPORTADORAS --------------------
export async function salvarFabrica(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome da fábrica.");
  const { error } = await admin.from("pa_fabricas").insert({ revenda_id: revendaId, nome });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Fábrica cadastrada");
}

export async function editarFabrica(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome da fábrica.");
  const { error } = await admin.from("pa_fabricas").update({ nome }).eq("id", id).eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Fábrica atualizada");
}

export async function excluirFabrica(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_fabricas").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("recebimento", "esta fábrica já tem recebimento registrado");
    erro("recebimento", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("recebimento", "Fábrica excluída");
}

export async function alternarFabricaAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_fabricas").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("recebimento", "Atualizado");
}

export async function salvarTransportadora(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome da transportadora.");
  const { error } = await admin.from("pa_transportadoras").insert({ revenda_id: revendaId, nome });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Transportadora cadastrada");
}

export async function editarTransportadora(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome da transportadora.");
  const { error } = await admin
    .from("pa_transportadoras")
    .update({ nome })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Transportadora atualizada");
}

export async function excluirTransportadora(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_transportadoras").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("recebimento", "esta transportadora já tem recebimento registrado");
    erro("recebimento", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("recebimento", "Transportadora excluída");
}

export async function alternarTransportadoraAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_transportadoras").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("recebimento", "Atualizado");
}

// -------------------- PRODUTOS --------------------
export async function salvarProduto(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!codigo || !descricao) erro("recebimento", "Informe código e descrição do produto.");
  const { error } = await admin.from("pa_produtos").insert({ revenda_id: revendaId, codigo, descricao });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Produto cadastrado");
}

export async function editarProduto(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!codigo || !descricao) erro("recebimento", "Informe código e descrição do produto.");
  const { error } = await admin
    .from("pa_produtos")
    .update({ codigo, descricao })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Produto atualizado");
}

export async function excluirProduto(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_produtos").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("recebimento", "este produto já foi recebido alguma vez");
    erro("recebimento", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("recebimento", "Produto excluído");
}

/** Colar uma lista "codigo;descricao", uma por linha -- para não digitar
 *  centenas de produtos um a um. */
export async function importarProdutos(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const bruto = String(formData.get("lista") ?? "");
  const linhas = bruto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [codigo, ...resto] = l.split(";");
      return { revenda_id: revendaId, codigo: (codigo ?? "").trim(), descricao: resto.join(";").trim() };
    })
    .filter((l) => l.codigo && l.descricao);

  if (linhas.length === 0) erro("recebimento", "Nenhuma linha válida no formato código;descrição.");

  const { error } = await admin.from("pa_produtos").upsert(linhas, { onConflict: "revenda_id,codigo" });
  if (error) erro("recebimento", `Não foi possível importar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("recebimento", `${linhas.length} produtos importados`);
}

/** Vincula (ou desvincula) o produto a uma embalagem -- é isso que
 *  libera o produto para aparecer no lançamento de Reepack/Despejo
 *  (junto com o Fator Hecto, que já vem pronto da importação). */
export async function vincularEmbalagemProduto(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const embalagemId = String(formData.get("embalagem_id") ?? "").trim() || null;
  const { error } = await admin
    .from("pa_produtos")
    .update({ embalagem_id: embalagemId })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("reepack-despejo", `Não foi possível vincular: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("reepack-despejo", "Embalagem vinculada");
}

/** Ajusta o Fator/Fator Hecto na mão, para os poucos produtos que a
 *  importação não conseguiu casar com a base do SAP. */
export async function editarFatorProduto(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const unidadesPorCaixa = numeroOuNulo(formData.get("unidades_por_caixa"));
  const fatorHecto = numeroOuNulo(formData.get("fator_hecto"));
  const { error } = await admin
    .from("pa_produtos")
    .update({ unidades_por_caixa: unidadesPorCaixa, fator_hecto: fatorHecto })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("reepack-despejo", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("reepack-despejo", "Fator atualizado");
}

export async function alternarProdutoAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  // Vem de duas abas (Recebimento e Reepack/Despejo) -- volta pra quem chamou.
  const aba = formData.get("aba") === "reepack-despejo" ? "reepack-despejo" : "recebimento";
  await admin.from("pa_produtos").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso(aba, "Atualizado");
}

/** Busca de produto usada no combobox do lançamento de recebimento --
 *  20 mil códigos não cabem num <select>, então a lista só existe
 *  filtrada, sob demanda, enquanto a pessoa digita. */
export async function buscarProdutos(termo: string) {
  const revendaId = await exigirRevenda("/produtividade-armazem/recebimento");
  if (termo.trim().length < 2) return [];

  const supabase = await createClient();
  const t = termo.trim();
  const { data } = await supabase
    .from("pa_produtos")
    .select("id, codigo, descricao")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`)
    .order("codigo")
    .limit(20);
  return data ?? [];
}

/** Mesma busca, mas só entre os produtos prontos para Reepack/Despejo
 *  (com Fator Hecto e embalagem vinculada) -- é a lista bem menor que
 *  os dois lançamentos oferecem pra escolha. */
export async function buscarProdutosReepack(termo: string) {
  const revendaId = await exigirRevenda("/produtividade-armazem");
  if (termo.trim().length < 2) return [];

  const supabase = await createClient();
  const t = termo.trim();
  const { data } = await supabase
    .from("pa_produtos")
    .select("id, codigo, descricao")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .not("fator_hecto", "is", null)
    .not("embalagem_id", "is", null)
    .or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`)
    .order("codigo")
    .limit(20);
  return data ?? [];
}

// -------------------- CHECKLIST 5S --------------------
export async function salvarItemChecklist5s(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const senso = formData.get("senso");
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!ehSenso(senso)) erro("cinco-s", "Escolha o senso.");
  if (!descricao) erro("cinco-s", "Descreva o item do checklist.");

  const { error } = await admin
    .from("pa_checklist_5s_itens")
    .insert({ revenda_id: revendaId, senso, descricao, ordem: 100 });
  if (error) erro("cinco-s", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("cinco-s", "Item cadastrado");
}

export async function editarItemChecklist5s(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!descricao) erro("cinco-s", "Descreva o item do checklist.");
  const { error } = await admin
    .from("pa_checklist_5s_itens")
    .update({ descricao })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("cinco-s", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("cinco-s", "Item atualizado");
}

export async function excluirItemChecklist5s(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_checklist_5s_itens").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("cinco-s", "este item já foi usado numa execução");
    erro("cinco-s", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("cinco-s", "Item excluído");
}

export async function alternarItemChecklist5sAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_checklist_5s_itens").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("cinco-s", "Atualizado");
}
