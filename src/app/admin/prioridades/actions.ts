"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_PRIORIDADES, MOTIVO_MIN, MOTIVOS_NA_LISTA_MAX, type Gv } from "@/lib/prioridades";
import { lerConfig } from "@/lib/prioridades-server";

const ROTA = "/admin/prioridades";

function novoToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function porta() {
  const perfil = await requireModulo(MODULO_PRIORIDADES, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { perfil, revendaId, admin: createAdminClient() };
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").replace(/\s+/g, " ").trim();

async function gravar(mudanca: { gvs?: Gv[]; motivos?: string[]; token_publico?: string }) {
  const { perfil, revendaId, admin } = await porta();
  const { error } = await admin
    .from("prioridades_config")
    .update({ ...mudanca, atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome })
    .eq("revenda_id", revendaId);
  if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
  revalidatePath(ROTA);
}

export async function adicionarGv(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId } = await porta();
    const nome = texto(fd, "nome").slice(0, 60);
    const codigo = texto(fd, "codigo").replace(/\D/g, "").slice(0, 6) || null;
    if (nome.length < 2) pararComErro("Escreva o nome do GV.");
    const { gvs } = await lerConfig(revendaId);
    if (gvs.some((g) => g.nome.toLowerCase() === nome.toLowerCase())) pararComErro("Esse GV já está na lista.");
    const lista = [...gvs, { codigo, nome }].sort((a, b) => (a.codigo ?? "999").localeCompare(b.codigo ?? "999", "pt-BR", { numeric: true }));
    await gravar({ gvs: lista });
    return deuCerto(`${nome} entrou na lista do link.`);
  });
}

export async function removerGv(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId } = await porta();
    const nome = texto(fd, "nome");
    const { gvs } = await lerConfig(revendaId);
    await gravar({ gvs: gvs.filter((g) => g.nome !== nome) });
    return deuCerto(`${nome} saiu da lista. O que ele já enviou continua no painel.`);
  });
}

export async function adicionarMotivo(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId } = await porta();
    const motivo = texto(fd, "motivo").slice(0, 60);
    if (motivo.length < MOTIVO_MIN) pararComErro("Escreva o motivo.");
    const { motivos } = await lerConfig(revendaId);
    if (motivos.some((m) => m.toLowerCase() === motivo.toLowerCase())) pararComErro("Esse motivo já está na lista.");
    if (motivos.length >= MOTIVOS_NA_LISTA_MAX) pararComErro(`A lista vai até ${MOTIVOS_NA_LISTA_MAX} motivos: tire um antes.`);
    await gravar({ motivos: [...motivos, motivo] });
    return deuCerto(`"${motivo}" entrou na lista.`);
  });
}

export async function removerMotivo(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId } = await porta();
    const motivo = texto(fd, "motivo");
    const { motivos } = await lerConfig(revendaId);
    const sobra = motivos.filter((m) => m !== motivo);
    // Lista vazia no banco = a lista padrão de volta; tirar o último não
    // deixaria o GV sem motivo, mas traria motivos que alguém tirou.
    if (sobra.length === 0) pararComErro("Deixe pelo menos um motivo na lista.");
    await gravar({ motivos: sobra });
    return deuCerto(`"${motivo}" saiu da lista. O que já foi enviado com ele continua no painel.`);
  });
}

/** Troca o link da revenda: o antigo para de aceitar na hora. */
export async function novoLink(): Promise<ResultadoAcao> {
  return noLugar(async () => {
    await gravar({ token_publico: novoToken() });
    return deuCerto("Link novo gerado. Mande para os GVs: o antigo não aceita mais prioridades.");
  });
}
