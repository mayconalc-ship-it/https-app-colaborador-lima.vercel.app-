"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_CHAMADOS } from "@/lib/chamados";

const ROTA = "/admin/chamados";

/**
 * O CADASTRO DOS CHAMADOS: áreas, o QR Code (um só por revenda) e prazos.
 *
 * Área não se apaga: desliga. Ela pode estar em chamados antigos --
 * desligar tira a área da lista sem mexer no histórico.
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim().replace(/\s+/g, " ");

/** 10 caracteres hexadecimais: curto para o QR, impossível de adivinhar. */
function novoCodigo() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function porta() {
  const perfil = await requireModulo(MODULO_CHAMADOS, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { perfil, revendaId, admin: createAdminClient() };
}

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath("/chamados");
}

export async function salvarPrazos(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const horas = (campo: string) => {
      const n = Number(String(fd.get(campo) ?? "").replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : NaN;
    };
    const prazos = { risco: horas("risco"), urgente: horas("urgente"), normal: horas("normal") };
    if (Object.values(prazos).some((h) => !(h >= 1 && h <= 2160))) pararComErro("Cada prazo vai de 1 hora a 90 dias (2.160 horas).");
    if (!(prazos.risco <= prazos.urgente && prazos.urgente <= prazos.normal)) {
      pararComErro("Risco precisa ter o menor prazo, e Normal o maior.");
    }
    const { error } = await admin.from("chamados_config").upsert(
      {
        revenda_id: revendaId,
        prazo_risco_horas: prazos.risco,
        prazo_urgente_horas: prazos.urgente,
        prazo_normal_horas: prazos.normal,
        atualizado_em: new Date().toISOString(),
        atualizado_por_nome: perfil.nome,
      },
      { onConflict: "revenda_id" },
    );
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto("Prazos salvos. Valem para os chamados abertos daqui em diante.");
  });
}

export async function criarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const grupo = texto(fd, "grupo").slice(0, 60);
    const nome = texto(fd, "nome").slice(0, 80);
    if (!nome) pararComErro("Escreva o nome da área.");
    const { data: ultima } = await admin
      .from("chamados_locais")
      .select("ordem")
      .eq("revenda_id", revendaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await admin
      .from("chamados_locais")
      .insert({ revenda_id: revendaId, grupo, nome, ordem: (ultima?.ordem ?? 0) + 1 });
    if (error?.code === "23505") pararComErro("Já existe uma área com esse nome nesse grupo.");
    if (error) pararComErro(`Não foi possível criar: ${error.message}`);
    revalidar();
    return deuCerto(`Área "${grupo ? `${grupo} · ` : ""}${nome}" criada. Já aparece na lista do formulário.`);
  });
}

export async function editarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "id");
    const grupo = texto(fd, "grupo").slice(0, 60);
    const nome = texto(fd, "nome").slice(0, 80);
    const ordem = Math.round(Number(texto(fd, "ordem")));
    if (!nome) pararComErro("Escreva o nome da área.");
    if (!Number.isFinite(ordem) || ordem < 0 || ordem > 999) pararComErro("A ordem vai de 0 a 999.");
    const { error } = await admin
      .from("chamados_locais")
      .update({ grupo, nome, ordem })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error?.code === "23505") pararComErro("Já existe uma área com esse nome nesse grupo.");
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto("Área salva. Os chamados antigos continuam com o nome da época.");
  });
}

export async function alternarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const ativo = texto(fd, "ativo") === "1";
    const { error } = await admin
      .from("chamados_locais")
      .update({ ativo })
      .eq("id", texto(fd, "id"))
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto(ativo ? "Área ligada: volta à lista do formulário." : "Área desligada: some da lista do formulário.");
  });
}

/** Troca o QR da revenda: o cartaz antigo para de abrir chamado. */
export async function novoQr(): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const { error } = await admin.from("chamados_config").upsert(
      { revenda_id: revendaId, token_publico: novoCodigo(), atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome },
      { onConflict: "revenda_id" },
    );
    if (error) pararComErro(`Não foi possível trocar: ${error.message}`);
    revalidar();
    return deuCerto("QR novo gerado. Imprima e troque os cartazes: o antigo não abre mais chamado.");
  });
}
