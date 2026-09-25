"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { primeiroDia } from "@/lib/mao-de-obra-server";
import {
  EH_FUNCAO,
  FUNCOES,
  LIMITES_MAO_DE_OBRA,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  PARAMETROS,
  RUBRICAS,
  ehCompetencia,
  validarAcao,
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

/** Número do formulário: vazio vira null, vírgula vira ponto. */
function numero(valor: FormDataEntryValue | null): number | null {
  const bruto = String(valor ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

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
    if (chave === "competencia" || chave === "observacao") continue;
    (mes[chave] as number | null) = numero(formData.get(chave));
  }
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
    if (p.id === "jornada" && v <= 0) voltar(competencia, "erro", "A jornada não pode ser zero.");
    valores[p.id] = v;
  }

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
