"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { ehSenso, ehTurno, litrosPorCaixa } from "@/lib/produtividade-armazem";
import { datetimeLocalParaUTC } from "@/lib/comunicados";

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

/**
 * Corrige o AGENDAMENTO de um atendimento de carreta -- pedido do dono,
 * 30/08/2026. A portaria pode marcar "carga agendada" por engano, ou
 * digitar o horário errado, e isso muda de onde o TMA começa a contar:
 * uma carreta que chegou 13h47 com agendamento às 14h tem 13 minutos de
 * espera que somem da conta.
 *
 * SÓ o agendamento se corrige aqui, de propósito. Chegada, início e fim
 * de descarga, carga e conferência são apontamentos do que aconteceu --
 * deixá-los editáveis seria dar a alguém a chave para melhorar o próprio
 * TMA depois do fato. Se um desses estiver errado, é caso de conversa com
 * quem apontou, não de campo no Admin.
 */
export async function corrigirAgendamentoCarreta(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("recebimento", "Atendimento inválido.");

  const agendada = formData.get("carga_agendada") === "on";
  const quando = String(formData.get("agendamento_em") ?? "").trim();

  let agendamentoEm: string | null = null;
  if (agendada) {
    if (!quando) erro("recebimento", "Informe a data/hora do agendamento.");
    // datetime-local não carrega fuso: sem isto o horário digitado seria
    // lido como UTC e gravaria 3h a menos.
    const iso = datetimeLocalParaUTC(quando);
    if (!iso) erro("recebimento", "Data/hora do agendamento inválida.");
    agendamentoEm = iso;
  }

  const { error } = await admin
    .from("atendimentos_carretas")
    .update({ carga_agendada: agendada, agendamento_em: agendamentoEm })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível corrigir: ${error.message}`);

  revalidatePath(ROTA);
  // O TMA é calculado na leitura, então as duas telas do recebimento já
  // mostram o número novo.
  revalidatePath("/carretas-conferencia");
  revalidatePath("/carretas-portaria");
  sucesso("recebimento", agendada ? "Agendamento corrigido" : "Marcado como sem agendamento");
}

/**
 * Corrige o horímetro (inicial e/ou final) de uma operação já lançada --
 * pedido do dono, 27/08/2026: empilhador digitou sem o ponto decimal e não
 * havia jeito de corrigir depois, nem para admin nem para liderança.
 * Só o número muda -- não mexe em status/fim, então uma operação ainda
 * aberta continua aberta mesmo que o horímetro final venha preenchido aqui
 * (a UI só mostra esse campo para operação já encerrada, exatamente para
 * evitar essa inconsistência).
 */
export async function corrigirHorimetroOperacao(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const horimetroInicial = numeroOuNulo(formData.get("horimetro_inicial"));
  if (horimetroInicial === null || horimetroInicial < 0) {
    erro("empilhadeiras", "Informe um horímetro inicial válido.");
  }

  const horimetroFinalTexto = String(formData.get("horimetro_final") ?? "").trim();
  const dados: { horimetro_inicial: number; horimetro_final?: number } = { horimetro_inicial: horimetroInicial };
  if (horimetroFinalTexto) {
    const horimetroFinal = numeroOuNulo(formData.get("horimetro_final"));
    if (horimetroFinal === null || horimetroFinal < 0) {
      erro("empilhadeiras", "Informe um horímetro final válido.");
    }
    if (horimetroFinal < horimetroInicial) {
      erro("empilhadeiras", "O horímetro final não pode ser menor que o inicial.");
    }
    dados.horimetro_final = horimetroFinal;
  }

  const { error } = await admin
    .from("pa_empilhadeira_operacoes")
    .update(dados)
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("empilhadeiras", `Não foi possível corrigir: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira");
  sucesso("empilhadeiras", "Horímetro corrigido");
}

/**
 * Corrige o horímetro de uma TROCA DE GÁS já lançada.
 *
 * A correção de horímetro criada em 27/08/2026 só cobria as operações --
 * a troca de gás ficou de fora, e o mesmo erro de digitar sem o ponto
 * (5485,0 virando 54850) não tinha conserto. Achado ao montar o
 * dashboard de consumo: um único registro assim jogava a média da
 * empilhadeira para 16.458 h/P20.
 */
export async function corrigirHorimetroTrocaGas(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const horimetro = numeroOuNulo(formData.get("horimetro"));
  if (!id) erro("empilhadeiras", "Troca inválida.");
  if (horimetro === null || horimetro < 0) {
    erro("empilhadeiras", "Informe um horímetro válido.");
  }

  const { error } = await admin
    .from("pa_empilhadeira_trocas_gas")
    .update({ horimetro })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("empilhadeiras", `Não foi possível corrigir: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira/gas");
  sucesso("empilhadeiras", "Horímetro da troca corrigido");
}


/**
 * Valor do botijão P20, usado pelo dashboard de consumo de gás para
 * virar custo por hora. Um valor por revenda -- decisão do dono
 * (28/08/2026): valor único, não histórico por troca.
 */
export async function salvarCustoP20(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  // Vazio LIMPA o valor: o dashboard some com os cartões de dinheiro e
  // segue mostrando horas e consumo. Melhor que travar num número velho.
  const bruto = String(formData.get("custo_p20") ?? "").trim().replace(",", ".");
  const custo = bruto === "" ? null : Number(bruto);
  if (custo !== null && (!Number.isFinite(custo) || custo < 0)) {
    erro("empilhadeiras", "Informe um valor válido para o P20.");
  }

  const { error } = await admin
    .from("pa_empilhadeira_config")
    .upsert(
      { revenda_id: revendaId, custo_p20: custo, atualizado_em: new Date().toISOString() },
      { onConflict: "revenda_id" },
    );
  if (error) erro("empilhadeiras", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira/gas");
  sucesso("empilhadeiras", custo === null ? "Valor do P20 removido" : "Valor do P20 atualizado");
}

/**
 * Tira do Storage as fotos de um registro que foi apagado.
 *
 * A URL pública é ".../object/public/conteudo/<caminho>"; o Storage quer
 * só o <caminho>. Se não der para extrair, tudo bem: o registro já foi
 * embora, e um arquivo órfão não vale desfazer a exclusão.
 */
async function apagarFotos(
  admin: ReturnType<typeof createAdminClient>,
  urls: (string | null | undefined)[],
) {
  const marca = "/object/public/conteudo/";
  const caminhos = urls
    .filter((u): u is string => typeof u === "string" && u.includes(marca))
    .map((u) => decodeURIComponent(u.slice(u.indexOf(marca) + marca.length).split("?")[0]))
    .filter(Boolean);
  if (caminhos.length > 0) await admin.storage.from("conteudo").remove(caminhos);
}

/**
 * Apaga uma operação de empilhadeira -- registro e as duas fotos.
 *
 * Mesmo degrau da exclusão de troca de gás: uma operação lançada por
 * engano, ou com a foto errada, não tem conserto no lugar. A foto É a
 * evidência do horímetro; trocá-la seria pior que apagar o registro.
 *
 * Apagar mexe no cálculo de horas do operador e no rateio de gás do
 * ciclo. É o efeito desejado quando o registro é falso -- mas por isso
 * fica atrás de "excluir", não de "editar".
 */
export async function excluirOperacaoEmpilhadeira(formData: FormData) {
  await requireModulo("produtividade-armazem", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("empilhadeiras", "Operação inválida.");

  // Lê antes de apagar: depois do delete não há mais como saber quais
  // arquivos eram.
  const { data: op } = await admin
    .from("pa_empilhadeira_operacoes")
    .select("foto_inicial_url, foto_final_url")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const { error } = await admin
    .from("pa_empilhadeira_operacoes")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("empilhadeiras", `Não foi possível excluir: ${error.message}`);

  await apagarFotos(admin, [op?.foto_inicial_url as string, op?.foto_final_url as string]);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira");
  revalidatePath("/produtividade-armazem/empilhadeira/gas");
  sucesso("empilhadeiras", "Operação excluída");
}

/**
 * Apaga uma troca de gás inteira -- registro e foto.
 *
 * Corrigir o horímetro não resolve tudo: uma troca lançada por engano, ou
 * com a foto errada, não tem como ser consertada no lugar (a foto é a
 * evidência, e trocá-la seria pior que apagar). Fica atrás de "excluir",
 * o mesmo degrau dos motivos de FEFO -- apagar dado do chão de fábrica
 * não é a mesma permissão que editar.
 *
 * A foto sai do Storage junto: deixar o arquivo para trás guardaria no
 * bucket público exatamente a imagem que a pessoa quis remover.
 */
export async function excluirTrocaGas(formData: FormData) {
  await requireModulo("produtividade-armazem", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("empilhadeiras", "Troca inválida.");

  // Lê antes de apagar: depois do delete não há mais como saber qual
  // arquivo era.
  const { data: troca } = await admin
    .from("pa_empilhadeira_trocas_gas")
    .select("foto_url")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const { error } = await admin
    .from("pa_empilhadeira_trocas_gas")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("empilhadeiras", `Não foi possível excluir: ${error.message}`);

  await apagarFotos(admin, [troca?.foto_url as string]);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira/gas");
  sucesso("empilhadeiras", "Troca de gás excluída");
}

// -------------------- ALERTA DE GÁS P20 --------------------
/**
 * Fornecedor e limite do alerta.
 *
 * O telefone é gravado como foi digitado, sem máscara: 0800, ramal e
 * WhatsApp de vendedor não cabem num formato só, e normalizar aqui
 * significaria recusar número válido. A tela formata na exibição.
 */
export async function salvarAlertaGas(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const nome = String(formData.get("fornecedor_nome") ?? "").trim();
  const telefone = String(formData.get("fornecedor_telefone") ?? "").trim();

  const brutoMinimo = String(formData.get("estoque_minimo_p20") ?? "").trim();
  const minimo = Number(brutoMinimo);
  if (!Number.isInteger(minimo) || minimo < 0) {
    erro("empilhadeiras", "O estoque mínimo deve ser um número inteiro igual ou maior que zero.");
  }

  const { error } = await admin.from("pa_empilhadeira_config").upsert(
    {
      revenda_id: revendaId,
      estoque_minimo_p20: minimo,
      fornecedor_nome: nome || null,
      fornecedor_telefone: telefone || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );
  if (error) erro("empilhadeiras", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/empilhadeira");
  sucesso("empilhadeiras", "Alerta de gás atualizado");
}

/** Acrescenta alguém da liderança à lista que recebe o aviso de gás. */
export async function adicionarNotificadoGas(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  if (!colaboradorId) erro("empilhadeiras", "Pessoa inválida.");

  // Clicar duas vezes no mesmo nome não pode virar erro na cara do Admin.
  const { error } = await admin
    .from("pa_gas_notificados")
    .upsert(
      { revenda_id: revendaId, colaborador_id: colaboradorId },
      { onConflict: "revenda_id,colaborador_id" },
    );
  if (error) erro("empilhadeiras", `Não foi possível incluir: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Pessoa incluída no aviso de gás");
}

export async function removerNotificadoGas(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  const { error } = await admin
    .from("pa_gas_notificados")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId);
  if (error) erro("empilhadeiras", `Não foi possível remover: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("empilhadeiras", "Pessoa removida do aviso de gás");
}

// -------------------- MOTIVOS DE QUEBRA DE FEFO --------------------
/**
 * Os motivos deixaram de ser lista fixa no código (migration 067): a
 * operação descobre caso novo antes de alguém pedir deploy, então o
 * cadastro mora aqui.
 *
 * Excluir é a ÚNICA ação separada, atrás de "excluir" em vez de
 * "editar" -- pedido do dono (27/08/2026): apagar motivo fica com ele.
 * Para tirar de circulação sem perder o histórico, use Desativar.
 */
export async function salvarMotivoFefo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("fefo", "Informe o nome do motivo.");
  const ajuda = String(formData.get("ajuda") ?? "").trim() || null;
  const emoji = String(formData.get("emoji") ?? "").trim().slice(0, 4) || null;
  const ordem = numeroOuNulo(formData.get("ordem")) ?? 0;

  const { error } = await admin
    .from("pa_fefo_motivos")
    .insert({ revenda_id: revendaId, nome, ajuda, emoji, ordem });
  if (error) {
    if (error.code === "23505") erro("fefo", "Já existe um motivo com esse nome.");
    erro("fefo", `Não foi possível salvar: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/fefo");
  sucesso("fefo", "Motivo cadastrado");
}

export async function editarMotivoFefo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("fefo", "Informe o nome do motivo.");
  const ajuda = String(formData.get("ajuda") ?? "").trim() || null;
  const emoji = String(formData.get("emoji") ?? "").trim().slice(0, 4) || null;
  const ordem = numeroOuNulo(formData.get("ordem")) ?? 0;

  const { error } = await admin
    .from("pa_fefo_motivos")
    .update({ nome, ajuda, emoji, ordem })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23505") erro("fefo", "Já existe um motivo com esse nome.");
    erro("fefo", `Não foi possível salvar: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/fefo");
  sucesso("fefo", "Motivo atualizado");
}

export async function alternarMotivoFefoAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_fefo_motivos").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  revalidatePath("/fefo");
  sucesso("fefo", ativo ? "Motivo desativado" : "Motivo ativado");
}

export async function excluirMotivoFefo(formData: FormData) {
  // "excluir", não "editar": apagar motivo fica só com quem tem essa ação.
  await requireModulo("produtividade-armazem", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");

  const { error } = await admin.from("pa_fefo_motivos").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    // A FK é restrict: motivo já usado numa ocorrência não some, senão o
    // histórico perderia a classificação.
    if (error.code === "23503") erroDeExclusao("fefo", "este motivo já foi usado numa ocorrência");
    erro("fefo", `Não foi possível excluir: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/fefo");
  sucesso("fefo", "Motivo excluído");
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

/** Nome completo = pelo menos um sobrenome, não só o primeiro nome. */
function ehNomeCompleto(nome: string): boolean {
  return nome.trim().split(/\s+/).filter(Boolean).length >= 2;
}

/** CPF só com os 11 dígitos -- sem validar dígito verificador (mesmo
 *  nível de rigor que o resto do app já usa pra CPF, ver profiles.cpf). */
function cpfOuErro(v: FormDataEntryValue | null, aba: string): string {
  const digitos = String(v ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) erro(aba, "Informe um CPF válido, com 11 dígitos.");
  return digitos;
}

// -------------------- MOTORISTAS --------------------
export async function salvarMotorista(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome do motorista.");
  if (!ehNomeCompleto(nome)) erro("recebimento", "Informe o nome completo do motorista.");
  const cpf = cpfOuErro(formData.get("cpf"), "recebimento");
  const { error } = await admin.from("pa_motoristas").insert({ revenda_id: revendaId, nome, cpf });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Motorista cadastrado");
}

export async function editarMotorista(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome do motorista.");
  if (!ehNomeCompleto(nome)) erro("recebimento", "Informe o nome completo do motorista.");
  const cpf = cpfOuErro(formData.get("cpf"), "recebimento");
  const { error } = await admin.from("pa_motoristas").update({ nome, cpf }).eq("id", id).eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Motorista atualizado");
}

export async function excluirMotorista(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_motoristas").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível excluir: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Motorista excluído");
}

export async function alternarMotoristaAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_motoristas").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("recebimento", "Atualizado");
}

/** Busca de motorista usada no combobox da Portaria -- sugere, não
 *  obriga: o campo continua texto livre em atendimentos_carretas. */
export async function buscarMotoristas(termo: string) {
  const revendaId = await exigirRevenda("/carretas-portaria");
  if (termo.trim().length < 2) return [];
  const supabase = await createClient();
  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  let consulta = supabase.from("pa_motoristas").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true);
  consulta = digitos.length >= 3 ? consulta.or(`nome.ilike.%${t}%,cpf.ilike.%${digitos}%`) : consulta.ilike("nome", `%${t}%`);
  const { data } = await consulta.order("nome").limit(10);
  return data ?? [];
}

// -------------------- EMPILHADORES --------------------
export async function salvarEmpilhador(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome do empilhador.");
  if (!ehNomeCompleto(nome)) erro("recebimento", "Informe o nome completo do empilhador.");
  const cpf = cpfOuErro(formData.get("cpf"), "recebimento");
  const { error } = await admin.from("pa_empilhadores").insert({ revenda_id: revendaId, nome, cpf });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Empilhador cadastrado");
}

export async function editarEmpilhador(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) erro("recebimento", "Informe o nome do empilhador.");
  if (!ehNomeCompleto(nome)) erro("recebimento", "Informe o nome completo do empilhador.");
  const cpf = cpfOuErro(formData.get("cpf"), "recebimento");
  const { error } = await admin.from("pa_empilhadores").update({ nome, cpf }).eq("id", id).eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Empilhador atualizado");
}

export async function excluirEmpilhador(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_empilhadores").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível excluir: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Empilhador excluído");
}

export async function alternarEmpilhadorAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_empilhadores").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("recebimento", "Atualizado");
}

/** Busca de empilhador usada no combobox da Conferência (item da
 *  descarga) -- mesma ideia do motorista: sugere, não obriga. */
export async function buscarEmpilhadores(termo: string) {
  const revendaId = await exigirRevenda("/carretas-conferencia");
  if (termo.trim().length < 2) return [];
  const supabase = await createClient();
  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  let consulta = supabase.from("pa_empilhadores").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true);
  consulta = digitos.length >= 3 ? consulta.or(`nome.ilike.%${t}%,cpf.ilike.%${digitos}%`) : consulta.ilike("nome", `%${t}%`);
  const { data } = await consulta.order("nome").limit(10);
  return data ?? [];
}

// -------------------- AG (ATIVO DE GIRO QUE RETORNA NA CARRETA) --------------------
export async function salvarAg(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const unidade = formData.get("unidade") === "unidade" ? "unidade" : "palete";
  if (!codigo || !descricao) erro("recebimento", "Informe código e descrição do AG.");
  const { error } = await admin.from("pa_ag_catalogo").insert({ revenda_id: revendaId, codigo, descricao, unidade });
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "AG cadastrado");
}

export async function editarAg(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const unidade = formData.get("unidade") === "unidade" ? "unidade" : "palete";
  if (!codigo || !descricao) erro("recebimento", "Informe código e descrição do AG.");
  const { error } = await admin
    .from("pa_ag_catalogo")
    .update({ codigo, descricao, unidade })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "AG atualizado");
}

export async function excluirAg(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await admin.from("pa_ag_catalogo").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23503") erroDeExclusao("recebimento", "este AG já foi usado num retorno de carreta");
    erro("recebimento", `Não foi possível excluir: ${error.message}`);
  }
  revalidatePath(ROTA);
  sucesso("recebimento", "AG excluído");
}

export async function alternarAgAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await admin.from("pa_ag_catalogo").update({ ativo: !ativo }).eq("id", id).eq("revenda_id", revendaId);
  revalidatePath(ROTA);
  sucesso("recebimento", "Atualizado");
}

// -------------------- CONFIG DE RECEBIMENTO (TMA alvo, validade) --------------------
export async function salvarConfigRecebimento(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const tmaAlvoMinutos = Number(formData.get("tma_alvo_minutos"));
  const diasMinimosValidadeAlerta = Number(formData.get("dias_minimos_validade_alerta"));
  if (!Number.isFinite(tmaAlvoMinutos) || tmaAlvoMinutos <= 0) {
    erro("recebimento", "Informe um TMA alvo válido, em minutos.");
  }
  if (!Number.isFinite(diasMinimosValidadeAlerta) || diasMinimosValidadeAlerta < 0) {
    erro("recebimento", "Informe os dias mínimos de validade.");
  }

  const { error } = await admin.from("pa_recebimento_config").upsert(
    { revenda_id: revendaId, tma_alvo_minutos: tmaAlvoMinutos, dias_minimos_validade_alerta: diasMinimosValidadeAlerta },
    { onConflict: "revenda_id" },
  );
  if (error) erro("recebimento", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("recebimento", "Configuração salva");
}

// -------------------- EMBALAGENS (DESPEJO) --------------------
/**
 * Embalagem do REPACK (pa_embalagens).
 *
 * O catálogo nasce da planilha de produtos, como o do Despejo -- por isso
 * aqui não há "criar": há o ajuste do que a importação não sabe. Hoje é a
 * meta de caixas por hora, que é a régua do acompanhamento por embalagem.
 *
 * Vazio LIMPA a meta: o cartão volta a ficar sem régua, que é diferente
 * de cadastrar zero.
 */
export async function editarEmbalagemRepack(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("reepack-despejo", "Embalagem inválida.");

  const bruto = String(formData.get("meta_reepacks_hora") ?? "").trim().replace(",", ".");
  const meta = bruto === "" ? null : Number(bruto);
  if (meta !== null && (!Number.isFinite(meta) || meta < 0)) {
    erro("reepack-despejo", "Informe uma meta válida (número igual ou maior que zero).");
  }

  const { error } = await admin
    .from("pa_embalagens")
    .update({ meta_reepacks_hora: meta })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("reepack-despejo", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/indicadores");
  sucesso("reepack-despejo", meta === null ? "Meta removida" : "Meta da embalagem atualizada");
}

/**
 * Liga/desliga uma embalagem do Repack.
 *
 * É o que consolida a lista na prática: a duplicata que a importação
 * deixou para trás some do cadastro sem apagar nenhum histórico, e volta
 * com um clique se tiver sido a errada.
 */
export async function alternarEmbalagemRepackAtivo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const ativo = String(formData.get("ativo") ?? "") === "true";
  if (!id) erro("reepack-despejo", "Embalagem inválida.");

  const { error } = await admin
    .from("pa_embalagens")
    .update({ ativo: !ativo })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("reepack-despejo", `Não foi possível alterar: ${error.message}`);

  revalidatePath(ROTA);
  sucesso("reepack-despejo", ativo ? "Embalagem desativada" : "Embalagem reativada");
}

/** Despejo tem catálogo próprio de embalagem (pa_embalagens_despejo,
 *  migration 064) -- diferente do catálogo do Repack. Litro por
 *  UNIDADE (converte unidades despejadas em litros, desde 26/08/2026 --
 *  antes era litro por pacote/caixa) e a meta de L/h (usada nos
 *  indicadores) são as duas contas que faltam pra embalagem funcionar
 *  no lançamento. A embalagem em si vem da planilha de produtos
 *  (find-or-create pelo nome, coluna EMBALAGEM_DESPEJO -- e já chega
 *  com o litro por unidade calculado sozinho, a partir do Fator Hecto
 *  e do Un/CX); aqui só se ajustam esses dois números, se precisar
 *  corrigir. */
export async function editarEmbalagemDespejo(formData: FormData) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const litrosPorUnidade = numeroOuNulo(formData.get("litros_por_unidade"));
  const metaLitrosHora = numeroOuNulo(formData.get("meta_litros_hora"));
  const { error } = await admin
    .from("pa_embalagens_despejo")
    .update({ litros_por_unidade: litrosPorUnidade, meta_litros_hora: metaLitrosHora })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro("reepack-despejo", `Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
  sucesso("reepack-despejo", "Embalagem atualizada");
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
 * por pallet, unidades por caixa, tipo, embalagens (uma pro Repack,
 * outra pro Despejo -- catálogos diferentes desde 26/08/2026) e meta
 * (reepack em caixas/hora, despejo em litros/hora) vêm todos da mesma
 * linha.
 *
 * As duas embalagens são resolvidas pelo NOME (find-or-create, cada
 * uma no seu catálogo -- pa_embalagens pro Repack, pa_embalagens_despejo
 * pro Despejo): se já existe pra esta revenda, reusa; se não, cria. A
 * de despejo já nasce com o litro por unidade calculado (Fator Hecto x
 * 100 ÷ Un/CX); a de repack nasce sem número nenhum, como sempre foi.
 * Produto é upsert por (revenda_id, código) -- reimportar a planilha
 * atualiza quem já existe, nunca duplica.
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
  // EMBALAGEM_REPACK é o nome novo (planilha com a coluna de despejo
  // separada, 26/08/2026); "EMBALAGEM" sozinho é aceito como sinônimo
  // pra planilha antiga continuar importando sem quebrar.
  const colEmbalagemRepack = coluna("EMBALAGEM_REPACK", "EMBALAGEM REPACK", "EMBALAGEM");
  const colEmbalagemDespejo = coluna("EMBALAGEM_DESPEJO", "EMBALAGEM DESPEJO");
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
    embalagemRepackNome: string | null;
    embalagemDespejoNome: string | null;
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
    const embalagemRepackNome = colEmbalagemRepack ? celulaTexto(row.getCell(colEmbalagemRepack).value).trim() : "";
    const embalagemDespejoNome = colEmbalagemDespejo ? celulaTexto(row.getCell(colEmbalagemDespejo).value).trim() : "";

    linhas.push({
      codigo: codigoTexto,
      descricao,
      cluster: colCluster ? celulaTexto(row.getCell(colCluster).value).trim() || null : null,
      fatorHecto: colFatorHecto ? celulaNumero(row.getCell(colFatorHecto).value) : null,
      caixasPallet: colCaixasPallet ? celulaNumero(row.getCell(colCaixasPallet).value) : null,
      unidadesPorCaixa: colUnCx ? celulaNumero(row.getCell(colUnCx).value) : null,
      tipo: tipoTexto === "DESCARTAVEL" || tipoTexto === "RETORNAVEL" ? tipoTexto : null,
      embalagemRepackNome: embalagemRepackNome || null,
      embalagemDespejoNome: embalagemDespejoNome || null,
      metaReepack: colMetaReepack ? celulaNumero(row.getCell(colMetaReepack).value) : null,
      metaDespejo: colMetaDespejo ? celulaNumero(row.getCell(colMetaDespejo).value) : null,
    });
  });

  if (linhas.length === 0) {
    erro("reepack-despejo", "Nenhuma linha válida encontrada (confira as colunas PROMAX e PRODUTO).");
  }

  // Embalagem do Repack: acha pelo nome (sem diferenciar maiúscula/
  // minúscula, igual ao índice único do banco) e cria só as que ainda
  // não existem.
  const { data: embalagensExistentes } = await admin
    .from("pa_embalagens")
    .select("id, nome")
    .eq("revenda_id", revendaId);
  const embalagemIdPorNome = new Map(
    (embalagensExistentes ?? []).map((e) => [e.nome.toLowerCase(), e.id] as const),
  );

  const faltantesPorChave = new Map<string, string>();
  for (const l of linhas) {
    if (!l.embalagemRepackNome) continue;
    const chave = l.embalagemRepackNome.toLowerCase();
    if (!embalagemIdPorNome.has(chave) && !faltantesPorChave.has(chave)) {
      faltantesPorChave.set(chave, l.embalagemRepackNome);
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

  // Embalagem do Despejo: catálogo PRÓPRIO (pa_embalagens_despejo),
  // separado do Repack -- mesmo find-or-create pelo nome, mas o litro
  // por unidade sai sozinho na criação (Fator Hecto x 100 ÷ Un/CX de
  // cada produto que usa essa embalagem de despejo), pela MODA entre os
  // produtos que compartilham o nome -- alguns raramente divergem entre
  // si (ex.: "LATA 269ML" com um SKU cadastrado como long neck por
  // engano na planilha), e a moda é o valor que a maioria confirma.
  // Reimportar NÃO sobrescreve o litro de quem já existe -- se o Admin
  // corrigiu manualmente, a planilha não desfaz.
  const { data: despejoExistentes } = await admin
    .from("pa_embalagens_despejo")
    .select("id, nome")
    .eq("revenda_id", revendaId);
  const despejoIdPorNome = new Map(
    (despejoExistentes ?? []).map((e) => [e.nome.toLowerCase(), e.id] as const),
  );

  const candidatosLitroPorDespejo = new Map<string, number[]>();
  for (const l of linhas) {
    if (!l.embalagemDespejoNome || l.fatorHecto === null || !l.unidadesPorCaixa) continue;
    const litrosPorUnidade = Math.round((litrosPorCaixa(l.fatorHecto) / l.unidadesPorCaixa) * 1000) / 1000;
    const chave = l.embalagemDespejoNome.toLowerCase();
    const arr = candidatosLitroPorDespejo.get(chave) ?? [];
    arr.push(litrosPorUnidade);
    candidatosLitroPorDespejo.set(chave, arr);
  }
  function modaOuNulo(valores: number[] | undefined): number | null {
    if (!valores || valores.length === 0) return null;
    const contagem = new Map<number, number>();
    for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const despejoFaltantesPorChave = new Map<string, string>();
  for (const l of linhas) {
    if (!l.embalagemDespejoNome) continue;
    const chave = l.embalagemDespejoNome.toLowerCase();
    if (!despejoIdPorNome.has(chave) && !despejoFaltantesPorChave.has(chave)) {
      despejoFaltantesPorChave.set(chave, l.embalagemDespejoNome);
    }
  }
  if (despejoFaltantesPorChave.size > 0) {
    const { error: erroDespejo } = await admin.from("pa_embalagens_despejo").insert(
      [...despejoFaltantesPorChave.entries()].map(([chave, nome]) => ({
        revenda_id: revendaId,
        nome,
        litros_por_unidade: modaOuNulo(candidatosLitroPorDespejo.get(chave)),
      })),
    );
    if (erroDespejo) erro("reepack-despejo", `Não foi possível criar embalagem de despejo: ${erroDespejo.message}`);
  }

  // Código duplicado na planilha (aconteceu na real: 3 produtos repetidos)
  // quebraria o upsert -- "ON CONFLICT DO UPDATE cannot affect row a
  // second time" é o Postgres recusando mexer na mesma linha duas vezes
  // no mesmo comando. Dedupe por código antes de upsertar, ficando com a
  // ÚLTIMA ocorrência (é a mais "de baixo" na planilha, presumida a mais
  // recente se alguém editou uma linha e esqueceu de apagar a antiga).
  const linhasPorCodigo = new Map<string, LinhaImportada>();
  for (const l of linhas) linhasPorCodigo.set(l.codigo, l);

  const linhasParaUpsert = [...linhasPorCodigo.values()].map((l) => ({
    revenda_id: revendaId,
    codigo: l.codigo,
    descricao: l.descricao,
    cluster_produto: l.cluster,
    fator_hecto: l.fatorHecto,
    caixas_pallet: l.caixasPallet,
    unidades_por_caixa: l.unidadesPorCaixa,
    tipo: l.tipo,
    embalagem_id: l.embalagemRepackNome ? (embalagemIdPorNome.get(l.embalagemRepackNome.toLowerCase()) ?? null) : null,
    meta_reepack_hora: l.metaReepack,
    meta_despejo_hora: l.metaDespejo,
  }));

  const { error } = await admin
    .from("pa_produtos")
    .upsert(linhasParaUpsert, { onConflict: "revenda_id,codigo" });
  if (error) erro("reepack-despejo", `Não foi possível importar: ${error.message}`);

  revalidatePath(ROTA);
  const mensagemDespejo =
    despejoFaltantesPorChave.size > 0 ? ` e ${despejoFaltantesPorChave.size} embalagem(ns) de despejo criada(s)` : "";
  sucesso("reepack-despejo", `${linhasParaUpsert.length} produtos importados/atualizados${mensagemDespejo}`);
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
/**
 * Busca com Cluster e Tipo opcionais (filtro em cascata pedido pelo dono,
 * 27/08/2026): sem eles, é preciso digitar pelo menos 2 letras, como
 * sempre; com um dos dois marcado, dá pra navegar a lista mesmo sem
 * digitar nada -- é o que permite "Cluster: Cerveja, Tipo: Descartável"
 * sozinhos já mostrarem os produtos.
 *
 * Limite subiu de 20 pra 50: com "ANTARCTICA" sem filtro nenhum, por
 * exemplo, existem 37 produtos numa revenda só, ordenados por código
 * (texto, não número) -- o 9067 caía na posição 28 e nunca aparecia com
 * o limite antigo. 50 cobre esse caso; o par Cluster+Tipo reduz ainda
 * mais o total normalmente.
 */
export async function buscarProdutosReepack(
  termo: string,
  filtros?: { cluster?: string; tipo?: string },
) {
  const revendaId = await exigirRevenda("/produtividade-armazem");
  const t = termo.trim();
  const temFiltro = Boolean(filtros?.cluster || filtros?.tipo);
  if (t.length < 2 && !temFiltro) return [];

  const supabase = await createClient();
  let consulta = supabase
    .from("pa_produtos")
    .select("id, codigo, descricao")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .not("fator_hecto", "is", null)
    .not("embalagem_id", "is", null);

  if (filtros?.cluster) consulta = consulta.eq("cluster_produto", filtros.cluster);
  if (filtros?.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (t) consulta = consulta.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`);

  const { data } = await consulta.order("codigo").limit(50);
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
