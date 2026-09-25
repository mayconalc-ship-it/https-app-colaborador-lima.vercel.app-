"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerConfig, lerMes, lerRealizado, lerSalarios, primeiroDia } from "@/lib/mao-de-obra-server";
import {
  EH_FUNCAO,
  FUNCOES,
  LIMITES_MAO_DE_OBRA,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  DIAS_DO_SELLOUT,
  PARAMETROS,
  RUBRICAS,
  validarSellout,
  diasDaCompetencia,
  dimensionamentoDoMes,
  tipoDoDia,
  ehCompetencia,
  lerNumeroDigitado,
  vagasDoMes,
  validarAcao,
  validarEmail,
  validarMes,
  type MesMaoDeObra,
} from "@/lib/mao-de-obra";

const ROTA = "/gestao/mao-de-obra";

function voltar(competencia: string, chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?mes=${competencia}&${chave}=${encodeURIComponent(mensagem)}`);
}

function atualizarTelas() {
  revalidatePath(ROTA);
}

/** Número do formulário -- a MESMA leitura da tela (lerNumeroDigitado). */
const numero = (valor: FormDataEntryValue | null): number | null => lerNumeroDigitado(String(valor ?? ""));

/**
 * O MÊS DO SIMULADOR -- volume, dias, frota e os turnos do armazém.
 *
 * Um Salvar só para a grade inteira: são campos do mesmo assunto, e
 * salvar campo a campo faria a liderança digitar quinze vezes. A gravação
 * carimba a REVISÃO do mês, que é a evidência que o DPO pede.
 */
export async function salvarMes(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const mes: MesMaoDeObra = { ...MES_VAZIO, competencia };
  for (const chave of Object.keys(MES_VAZIO) as (keyof MesMaoDeObra)[]) {
    if (chave === "competencia" || chave === "observacao" || chave === "base_meta") continue;
    (mes[chave] as number | null) = numero(formData.get(chave));
  }
  mes.base_meta = String(formData.get("base_meta") ?? "") === "ppr" ? "ppr" : "negociado";
  mes.observacao = String(formData.get("observacao") ?? "").trim().slice(0, LIMITES_MAO_DE_OBRA.observacaoMax) || null;

  // A MESMA regra da tela (validarMes), agora no servidor.
  const problema = validarMes(mes);
  if (problema) voltar(competencia, "erro", problema);

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_meses").upsert(
    {
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      ...Object.fromEntries(
        (Object.keys(MES_VAZIO) as (keyof MesMaoDeObra)[])
          .filter((k) => k !== "competencia")
          .map((k) => [k, mes[k]]),
      ),
      revisado_em: new Date().toISOString(),
      revisado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id,competencia" },
  );
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Mês salvo e revisão registrada.");
}

/** O QLP real de cada função -- o outro lado do "dimensionado x realizado". */
export async function salvarRealizado(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const linhas: { revenda_id: string; competencia: string; funcao: string; quantidade: number; atualizado_por_nome: string }[] = [];
  for (const f of FUNCOES) {
    const valor = numero(formData.get(`real_${f.id}`));
    if (valor == null) continue;
    if (valor < 0 || valor > LIMITES_MAO_DE_OBRA.pessoasMax) {
      voltar(competencia, "erro", `Quantidade inválida em ${f.rotulo}.`);
    }
    linhas.push({
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      funcao: f.id,
      quantidade: Math.round(valor),
      atualizado_por_nome: perfil.nome,
    });
  }

  const admin = createAdminClient();
  if (linhas.length > 0) {
    const { error } = await admin
      .from("mao_obra_realizado")
      .upsert(linhas, { onConflict: "revenda_id,competencia,funcao" });
    if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);
  }
  // Função deixada em branco volta a não ter realizado informado.
  const informadas = linhas.map((l) => l.funcao);
  const apagar = FUNCOES.map((f) => f.id).filter((f) => !informadas.includes(f));
  if (apagar.length > 0) {
    await admin
      .from("mao_obra_realizado")
      .delete()
      .eq("revenda_id", revendaId)
      .eq("competencia", primeiroDia(competencia))
      .in("funcao", apagar);
  }

  atualizarTelas();
  voltar(competencia, "sucesso", "Quadro realizado atualizado.");
}

/** Os parâmetros da operação (a aba Imputs da planilha). */
export async function salvarParametros(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  const valores: Record<string, number> = {};
  for (const p of PARAMETROS) {
    const v = numero(formData.get(p.id));
    if (v == null || v < 0) voltar(competencia, "erro", `Informe um número válido em ${p.rotulo}.`);
    // O teto da coluna (migration 135): sem isto o banco recusava com
    // "numeric field overflow", que não diz nada a quem está na tela.
    if (v > p.limite) {
      voltar(
        competencia,
        "erro",
        `${p.rotulo}: ${v.toLocaleString("pt-BR")} passa do máximo aceito (${p.limite.toLocaleString("pt-BR")}). Use vírgula para o decimal — 0,305556, por exemplo.`,
      );
    }
    if (p.id === "jornada" && v <= 0) voltar(competencia, "erro", "A jornada não pode ser zero.");
    valores[p.id] = v;
  }

  // A CURVA DE SELLOUT: ou está desligada (tudo zero) ou fecha em 100%.
  const curva: Record<string, number> = {};
  for (const d of DIAS_DO_SELLOUT) {
    const v = numero(formData.get(d.id)) ?? 0;
    if (v < 0 || v > 100) voltar(competencia, "erro", `Percentual inválido em ${d.rotulo}.`);
    curva[d.id] = v;
  }
  const problemaDaCurva = validarSellout(curva as Parameters<typeof validarSellout>[0]);
  if (problemaDaCurva) voltar(competencia, "erro", problemaDaCurva);
  Object.assign(valores, curva);

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_config").upsert(
    {
      revenda_id: revendaId,
      ...valores,
      atualizado_em: new Date().toISOString(),
      atualizado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id" },
  );
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Parâmetros salvos.");
}

/** A base salarial de uma função -- o que multiplica o dimensionamento. */
export async function salvarSalario(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  const funcao = String(formData.get("funcao") ?? "");
  if (!EH_FUNCAO(funcao)) voltar(competencia, "erro", "Função inválida.");

  const valores: Record<string, number> = {};
  for (const r of RUBRICAS) {
    const v = numero(formData.get(r.id)) ?? 0;
    if (v < 0 || v > 1_000_000) voltar(competencia, "erro", `Valor inválido em ${r.rotulo}.`);
    valores[r.id] = v;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_salarios").upsert(
    {
      revenda_id: revendaId,
      funcao,
      ...valores,
      atualizado_em: new Date().toISOString(),
      atualizado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id,funcao" },
  );
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Base salarial atualizada.");
}

/** Uma ação do plano -- o desvio que vira tarefa com dono e prazo. */
export async function criarAcao(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const oQue = String(formData.get("o_que") ?? "").trim();
  const responsavel = String(formData.get("responsavel") ?? "").trim();
  const prazo = String(formData.get("prazo") ?? "").trim() || null;
  const funcao = String(formData.get("funcao") ?? "");

  const problema = validarAcao({ oQue, responsavel, prazo });
  if (problema) voltar(competencia, "erro", problema);

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_acoes").insert({
    revenda_id: revendaId,
    competencia: primeiroDia(competencia),
    funcao: EH_FUNCAO(funcao) ? funcao : null,
    o_que: oQue.slice(0, LIMITES_MAO_DE_OBRA.textoMax),
    responsavel: responsavel.slice(0, LIMITES_MAO_DE_OBRA.responsavelMax),
    prazo,
    criado_por_nome: perfil.nome,
  });
  if (error) voltar(competencia, "erro", `Não foi possível salvar a ação: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Ação incluída no plano.");
}

export async function mudarStatusDaAcao(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const competencia = String(formData.get("competencia") ?? "");
  if (!id) voltar(competencia, "erro", "Ação inválida.");
  if (!["aberta", "em_andamento", "concluida"].includes(status)) voltar(competencia, "erro", "Situação inválida.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("mao_obra_acoes")
    .update({ status, concluida_em: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Situação da ação atualizada.");
}

// ------------------------------------------------------------------
// VAGAS PARA O RECRUTAMENTO (25/09/2026)
// ------------------------------------------------------------------

/** Cadastra quem recebe o quadro de vagas. */
export async function adicionarDestinatario(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120) || null;
  const problema = validarEmail(email);
  if (problema) voltar(competencia, "erro", problema);

  const admin = createAdminClient();
  const { error } = await admin
    .from("mao_obra_destinatarios")
    .insert({ revenda_id: revendaId, email, nome, criado_por_nome: perfil.nome });
  if (error?.code === "23505") voltar(competencia, "erro", "Este e-mail já está cadastrado.");
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", `${email} vai receber o quadro de vagas.`);
}

export async function removerDestinatario(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) voltar(competencia, "erro", "Destinatário inválido.");

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_destinatarios").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível remover: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Destinatário removido.");
}

/**
 * Registra o envio do quadro de vagas ao recrutamento.
 *
 * O e-mail em si abre no cliente da pessoa (o app não tem SMTP, e assim
 * ele sai do endereço da empresa). O que fica aqui é a EVIDÊNCIA: quando,
 * por quem, para quem e qual quadro -- congelado, porque o mês seguinte
 * muda o dimensionamento e a auditoria pergunta pelo que foi enviado.
 */
export async function registrarEnvio(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, LIMITES_MAO_DE_OBRA.observacaoMax) || null;

  const admin = createAdminClient();

  // O quadro é recalculado AQUI, do banco: o que o formulário mandasse
  // seria a tela de quem clicou, não a verdade do mês.
  const [config, salarios, mes, realizado, { data: destinos }] = await Promise.all([
    lerConfig(revendaId),
    lerSalarios(revendaId),
    lerMes(revendaId, competencia),
    lerRealizado(revendaId, competencia),
    admin.from("mao_obra_destinatarios").select("email").eq("revenda_id", revendaId).eq("ativo", true),
  ]);
  if (!mes) voltar(competencia, "erro", "Lance o volume do mês antes de enviar o dimensionamento.");
  const emails = (destinos ?? []).map((d) => String(d.email));
  if (emails.length === 0) voltar(competencia, "erro", "Cadastre pelo menos um e-mail do recrutamento.");

  const { linhas } = dimensionamentoDoMes(mes, config, salarios, realizado);
  const vagas = vagasDoMes(linhas);
  const total = vagas.reduce((s, v) => s + v.vagas, 0);

  const { error } = await admin.from("mao_obra_envios").insert({
    revenda_id: revendaId,
    competencia: primeiroDia(competencia),
    enviado_por_nome: perfil.nome,
    destinatarios: emails,
    vagas: vagas.map((v) => ({
      funcao: v.funcao,
      rotulo: v.rotulo,
      dimensionado: v.dimensionado,
      atual: v.atual,
      vagas: v.vagas,
    })),
    total_vagas: total,
    observacao,
  });
  if (error) voltar(competencia, "erro", `Não foi possível registrar o envio: ${error.message}`);

  atualizarTelas();
  voltar(
    competencia,
    "sucesso",
    `Envio registrado: ${total} vaga${total === 1 ? "" : "s"} para ${emails.length} destinatário${emails.length === 1 ? "" : "s"}.`,
  );
}

/** O volume realizado de cada dia do mês -- um Salvar para a grade toda. */
export async function salvarDias(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const guardar: {
    revenda_id: string;
    competencia: string;
    dia: number;
    volume_realizado: number | null;
    opera: boolean;
    atualizado_por_nome: string;
  }[] = [];
  const apagar: number[] = [];
  for (let dia = 1; dia <= diasDaCompetencia(competencia); dia++) {
    const valor = numero(formData.get(`dia_${dia}`));
    // A caixinha só chega marcada; desmarcada não vem no formulário.
    const opera = formData.get(`opera_${dia}`) != null;
    const padrao = tipoDoDia(`${competencia}-${String(dia).padStart(2, "0")}`) !== "domingo";
    if (valor == null && opera === padrao) {
      // Nada digitado e o dia está como nasce: não precisa de linha.
      apagar.push(dia);
      continue;
    }
    if (valor != null && (valor < 0 || valor > LIMITES_MAO_DE_OBRA.volumeMax)) {
      voltar(competencia, "erro", `Volume inválido no dia ${dia}.`);
    }
    guardar.push({
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      dia,
      volume_realizado: valor,
      opera,
      atualizado_por_nome: perfil.nome,
    });
  }

  const admin = createAdminClient();
  if (guardar.length > 0) {
    const { error } = await admin
      .from("mao_obra_dias")
      .upsert(guardar, { onConflict: "revenda_id,competencia,dia" });
    if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);
  }
  if (apagar.length > 0) {
    await admin
      .from("mao_obra_dias")
      .delete()
      .eq("revenda_id", revendaId)
      .eq("competencia", primeiroDia(competencia))
      .in("dia", apagar);
  }

  atualizarTelas();
  redirect(`${ROTA}?mes=${competencia}&aba=dia&sucesso=${encodeURIComponent("Volume do dia salvo.")}`);
}

export async function excluirAcao(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const competencia = String(formData.get("competencia") ?? "");
  if (!id) voltar(competencia, "erro", "Ação inválida.");

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_acoes").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível apagar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Ação apagada.");
}
