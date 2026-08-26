"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
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

/** Traduz violação de chave estrangeira (23503) numa mensagem que explica
 *  o que fazer, em vez do código do Postgres. Todo excluir passa por aqui. */
function erroDeExclusao(aba: string, mensagem: string): never {
  erro(
    aba,
    `Não é possível excluir: ${mensagem}. Já existem lançamentos usando este cadastro -- desative em vez de excluir.`,
  );
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

/** Célula do ExcelJS -> texto, desembrulhando fórmula/rich text/hyperlink
 *  (mesma lógica de lib/rv-server.ts, copiada aqui pra não criar uma
 *  dependência cruzada entre os dois importadores por causa de 6 linhas). */
function celulaTexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) return valor.toLocaleDateString("pt-BR");
  if (typeof valor === "object") {
    const obj = valor as unknown as Record<string, unknown>;
    if ("result" in obj) return celulaTexto(obj.result as ExcelJS.CellValue);
    if ("text" in obj) return String(obj.text).trim();
    if ("richText" in obj) {
      return (obj.richText as { text: string }[]).map((p) => p.text).join("").trim();
    }
    if ("hyperlink" in obj) return String(obj.text ?? "").trim();
  }
  return String(valor).trim();
}

/** Célula -> número, ou null se vazia/não numérica (planilha traz meta
 *  em branco até a liderança definir -- não é 0, é "sem meta ainda"). */
function celulaNumero(valor: ExcelJS.CellValue): number | null {
  const texto = celulaTexto(valor).replace(",", ".");
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza cabeçalho de coluna pra comparar sem depender de acento,
 *  espaço a mais ou maiúscula/minúscula. */
function normalizarCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cadastro de produto para Reepack/Despejo, tudo de uma planilha só --
 * substitui as duas telas que existiam antes (Embalagens + vincular
 * produto a produto): código, descrição, cluster, Fator Hecto, caixas
 * por pallet, unidades por caixa, tipo, embalagem e meta (reepack em
 * caixas/hora, despejo em litros/hora) vêm todos da mesma linha.
 *
 * A embalagem é resolvida pelo NOME (find-or-create em pa_embalagens):
 * se "LATA 350ML C/12" já existe pra esta revenda, reusa; se não,
 * cria. Produto é upsert por (revenda_id, código) -- reimportar a
 * planilha atualiza quem já existe, nunca duplica.
 */
export async function importarPlanilhaProdutos(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    erro("reepack-despejo", "Escolha o arquivo da planilha (.xlsx).");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    erro("reepack-despejo", "Não foi possível abrir o arquivo -- confira se é um .xlsx válido.");
  }
  const aba = workbook.worksheets[0];
  if (!aba) erro("reepack-despejo", "Planilha vazia.");

  const colunaPorCabecalho = new Map<string, number>();
  aba.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const chave = normalizarCabecalho(celulaTexto(cell.value));
    if (chave) colunaPorCabecalho.set(chave, col);
  });
  const coluna = (...nomes: string[]) => {
    for (const n of nomes) {
      const c = colunaPorCabecalho.get(n);
      if (c) return c;
    }
    return null;
  };

  const colCodigo = coluna("PROMAX");
  const colDescricao = coluna("PRODUTO");
  const colCluster = coluna("CLUSTER PRODUTO");
  const colFatorHecto = coluna("FATOR HECTO");
  const colCaixasPallet = coluna("CAIXAS PALLET");
  const colUnCx = coluna("UN/CX", "UN CX");
  const colTipo = coluna("TIPO");
  const colEmbalagem = coluna("EMBALAGEM");
  const colMetaReepack = coluna("META_(CX)REPACK/H", "META (CX)REPACK/H", "META (CX) REPACK/H");
  const colMetaDespejo = coluna("META_(L)DESPEJO/H", "META (L)DESPEJO/H", "META (L) DESPEJO/H");

  if (!colCodigo || !colDescricao) {
    erro("reepack-despejo", "A planilha precisa ter as colunas PROMAX e PRODUTO.");
  }

  type LinhaImportada = {
    codigo: string;
    descricao: string;
    cluster: string | null;
    fatorHecto: number | null;
    caixasPallet: number | null;
    unidadesPorCaixa: number | null;
    tipo: "DESCARTAVEL" | "RETORNAVEL" | null;
    embalagemNome: string | null;
    metaReepack: number | null;
    metaDespejo: number | null;
  };
  const linhas: LinhaImportada[] = [];

  aba.eachRow({ includeEmpty: false }, (row, numeroLinha) => {
    if (numeroLinha === 1) return;
    const codigoTexto = celulaTexto(row.getCell(colCodigo).value).trim();
    const descricao = celulaTexto(row.getCell(colDescricao).value).trim();
    if (!codigoTexto || !descricao) return; // linha em branco/lixo, ignora

    const tipoTexto = colTipo ? normalizarCabecalho(celulaTexto(row.getCell(colTipo).value)) : "";
    const embalagemNome = colEmbalagem ? celulaTexto(row.getCell(colEmbalagem).value).trim() : "";

    linhas.push({
      codigo: codigoTexto,
      descricao,
      cluster: colCluster ? celulaTexto(row.getCell(colCluster).value).trim() || null : null,
      fatorHecto: colFatorHecto ? celulaNumero(row.getCell(colFatorHecto).value) : null,
      caixasPallet: colCaixasPallet ? celulaNumero(row.getCell(colCaixasPallet).value) : null,
      unidadesPorCaixa: colUnCx ? celulaNumero(row.getCell(colUnCx).value) : null,
      tipo: tipoTexto === "DESCARTAVEL" || tipoTexto === "RETORNAVEL" ? tipoTexto : null,
      embalagemNome: embalagemNome || null,
      metaReepack: colMetaReepack ? celulaNumero(row.getCell(colMetaReepack).value) : null,
      metaDespejo: colMetaDespejo ? celulaNumero(row.getCell(colMetaDespejo).value) : null,
    });
  });

  if (linhas.length === 0) {
    erro("reepack-despejo", "Nenhuma linha válida encontrada (confira as colunas PROMAX e PRODUTO).");
  }

  // Embalagem: acha pelo nome (sem diferenciar maiúscula/minúscula, igual
  // ao índice único do banco) e cria só as que ainda não existem.
  const { data: embalagensExistentes } = await admin
    .from("pa_embalagens")
    .select("id, nome")
    .eq("revenda_id", revendaId);
  const embalagemIdPorNome = new Map(
    (embalagensExistentes ?? []).map((e) => [e.nome.toLowerCase(), e.id] as const),
  );

  const faltantesPorChave = new Map<string, string>();
  for (const l of linhas) {
    if (!l.embalagemNome) continue;
    const chave = l.embalagemNome.toLowerCase();
    if (!embalagemIdPorNome.has(chave) && !faltantesPorChave.has(chave)) {
      faltantesPorChave.set(chave, l.embalagemNome);
    }
  }
  if (faltantesPorChave.size > 0) {
    const { data: criadas, error: erroEmbalagem } = await admin
      .from("pa_embalagens")
      .insert([...faltantesPorChave.values()].map((nome) => ({ revenda_id: revendaId, nome })))
      .select("id, nome");
    if (erroEmbalagem) erro("reepack-despejo", `Não foi possível criar embalagem: ${erroEmbalagem.message}`);
    for (const e of criadas ?? []) embalagemIdPorNome.set(e.nome.toLowerCase(), e.id);
  }

  const linhasParaUpsert = linhas.map((l) => ({
    revenda_id: revendaId,
    codigo: l.codigo,
    descricao: l.descricao,
    cluster_produto: l.cluster,
    fator_hecto: l.fatorHecto,
    caixas_pallet: l.caixasPallet,
    unidades_por_caixa: l.unidadesPorCaixa,
    tipo: l.tipo,
    embalagem_id: l.embalagemNome ? (embalagemIdPorNome.get(l.embalagemNome.toLowerCase()) ?? null) : null,
    meta_reepack_hora: l.metaReepack,
    meta_despejo_hora: l.metaDespejo,
  }));

  const { error } = await admin
    .from("pa_produtos")
    .upsert(linhasParaUpsert, { onConflict: "revenda_id,codigo" });
  if (error) erro("reepack-despejo", `Não foi possível importar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("reepack-despejo", `${linhasParaUpsert.length} produtos importados/atualizados`);
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
