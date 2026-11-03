"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_PRIORIDADES, type Gv } from "@/lib/prioridades";
import { lerConfig } from "@/lib/prioridades-server";

const ROTA = "/gestao/prioridades";

function novoToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function porta() {
  const perfil = await requireModulo(MODULO_PRIORIDADES, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { perfil, revendaId, admin: createAdminClient() };
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").replace(/\s+/g, " ").trim();

async function gravarGvs(gvs: Gv[]) {
  const { perfil, revendaId, admin } = await porta();
  const { error } = await admin
    .from("prioridades_config")
    .update({ gvs, atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome })
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
    await gravarGvs(lista);
    return deuCerto(`${nome} entrou na lista do link.`);
  });
}

export async function removerGv(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId } = await porta();
    const nome = texto(fd, "nome");
    const { gvs } = await lerConfig(revendaId);
    await gravarGvs(gvs.filter((g) => g.nome !== nome));
    return deuCerto(`${nome} saiu da lista. O que ele já enviou continua no painel.`);
  });
}

/** Troca o link da revenda: o antigo para de aceitar na hora. */
export async function novoLink(): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const { error } = await admin
      .from("prioridades_config")
      .update({ token_publico: novoToken(), atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome })
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível trocar: ${error.message}`);
    revalidatePath(ROTA);
    return deuCerto("Link novo gerado. Mande para os GVs: o antigo não aceita mais prioridades.");
  });
}

/** Tira uma prioridade lançada por engano (código errado, PDV repetido). */
export async function removerPrioridade(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "id");
    const { data, error } = await admin.from("prioridades").delete().eq("id", id).eq("revenda_id", revendaId).select("cod_pdv");
    if (error) pararComErro(`Não foi possível tirar: ${error.message}`);
    if (!data?.length) pararComErro("Essa prioridade já não estava na lista.");
    revalidatePath(ROTA);
    return deuCerto(`PDV ${data[0].cod_pdv} saiu da lista.`);
  });
}
