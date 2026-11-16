"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { paraNumero } from "@/lib/manutencao-preventiva";

const ROTA = "/admin/manutencao-preventiva";

/**
 * O CADASTRO DA PREVENTIVA (16/11/2026): os aparelhos de cada modelo, a
 * frequência e a faixa aceitável dos números. Aparelho não se apaga:
 * desliga -- ele pode estar em preventivas antigas.
 */

const texto = (fd: FormData, campo: string, max = 80) =>
  String(fd.get(campo) ?? "").trim().replace(/\s+/g, " ").slice(0, max);

async function porta() {
  await requireModulo("manutencao-preventiva", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { revendaId, admin: createAdminClient() };
}

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath("/manutencao-preventiva");
  revalidatePath("/manutencao-central");
}

/** Dias de 1 a 365; vazio = null quando `vazioPode`. */
function dias(fd: FormData, campo: string, vazioPode: boolean): number | null {
  const bruto = String(fd.get(campo) ?? "").trim();
  if (bruto === "" && vazioPode) return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 365) pararComErro("A frequência vai de 1 a 365 dias.");
  return n;
}

export async function salvarModelo(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "modelo_id", 40);
    const periodicidade = dias(fd, "periodicidade_dias", false);
    const ativo = fd.get("ativo") === "on";
    const { error } = await admin
      .from("manut_prev_modelos")
      .update({ periodicidade_dias: periodicidade, ativo })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto(ativo ? `Salvo: a cada ${periodicidade} dias.` : "Checklist desligado nesta revenda.");
  });
}

function dadosDoEquipamento(fd: FormData) {
  const codigo = texto(fd, "codigo", 30).toUpperCase();
  if (!codigo) pararComErro("Informe o código do aparelho (a etiqueta, ex.: AC-01).");
  return {
    codigo,
    local: texto(fd, "local", 80),
    marca: texto(fd, "marca", 80) || null,
    capacidade: texto(fd, "capacidade", 40) || null,
    observacao: texto(fd, "observacao", 300) || null,
    periodicidade_dias: dias(fd, "periodicidade_dias", true),
  };
}

export async function criarEquipamento(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const modeloId = texto(fd, "modelo_id", 40);
    const { data: modelo } = await admin
      .from("manut_prev_modelos")
      .select("id")
      .eq("id", modeloId)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    if (!modelo) pararComErro("Checklist não encontrado.");
    const dados = dadosDoEquipamento(fd);
    const { error } = await admin
      .from("manut_prev_equipamentos")
      .insert({ ...dados, modelo_id: modeloId, revenda_id: revendaId });
    if (error) {
      if (error.code === "23505") pararComErro(`Já existe um aparelho com o código ${dados.codigo}.`);
      pararComErro(`Não foi possível cadastrar: ${error.message}`);
    }
    revalidar();
    return deuCerto(`${dados.codigo} cadastrado. A primeira preventiva vence pela frequência a partir de hoje.`);
  });
}

export async function editarEquipamento(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "equipamento_id", 40);
    const dados = dadosDoEquipamento(fd);
    const { error } = await admin
      .from("manut_prev_equipamentos")
      .update(dados)
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) {
      if (error.code === "23505") pararComErro(`Já existe um aparelho com o código ${dados.codigo}.`);
      pararComErro(`Não foi possível salvar: ${error.message}`);
    }
    revalidar();
    return deuCerto(`${dados.codigo} atualizado.`);
  });
}

export async function alternarEquipamento(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "equipamento_id", 40);
    const ativo = fd.get("ativo") === "true";
    const { error } = await admin
      .from("manut_prev_equipamentos")
      .update({ ativo })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto(ativo ? "Aparelho religado." : "Aparelho desligado: sai da lista e do lembrete, o histórico fica.");
  });
}

/** A faixa aceitável de um item numérico (ex.: temperatura da câmara). */
export async function salvarFaixa(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "item_id", 40);
    const minimo = paraNumero(fd.get("minimo"));
    const maximo = paraNumero(fd.get("maximo"));
    if (minimo !== null && maximo !== null && minimo > maximo) pararComErro("O mínimo não pode passar do máximo.");
    const { error } = await admin
      .from("manut_prev_itens")
      .update({ minimo, maximo })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto("Faixa salva. Vale para as próximas preventivas.");
  });
}
