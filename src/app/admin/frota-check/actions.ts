"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_FROTA_CHECK, normalizarPlaca } from "@/lib/frota-check";

const ROTA = "/admin/frota-check";

/**
 * O CADASTRO DO CHECK DA FROTA: as placas de cada revenda e quem responde
 * por cada uma. Placa não se apaga (tem histórico): desativa.
 *
 * Escolher a pessoa já LIBERA o módulo para ela nesta revenda -- quem
 * responde pela placa precisa abrir o check (pedido do dono: "essa pessoa
 * será cadastrada no app").
 */
async function porta() {
  await requireModulo(MODULO_FROTA_CHECK, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { revendaId, admin: createAdminClient() };
}

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath("/frota-check");
}

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export async function cadastrarPlacas(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const brutas = String(fd.get("placas") ?? "")
      .split(/[\s,;]+/)
      .map(normalizarPlaca)
      .filter(Boolean);
    const placas = [...new Set(brutas)];
    const invalidas = placas.filter((p) => !PLACA.test(p));
    if (invalidas.length) pararComErro(`Placa inválida: ${invalidas.slice(0, 5).join(", ")}. Use o formato ABC1D23.`);
    if (placas.length === 0) pararComErro("Escreva ao menos uma placa.");
    const { data: ja } = await admin.from("cf_veiculos").select("placa, ativo").eq("revenda_id", revendaId).in("placa", placas);
    const existentes = new Map((ja ?? []).map((v) => [v.placa, v.ativo]));
    const novas = placas.filter((p) => !existentes.has(p));
    const religar = placas.filter((p) => existentes.get(p) === false);
    if (novas.length) {
      const { error } = await admin.from("cf_veiculos").insert(novas.map((placa) => ({ revenda_id: revendaId, placa })));
      if (error) pararComErro(`Não cadastrou: ${error.message}`);
    }
    if (religar.length) await admin.from("cf_veiculos").update({ ativo: true }).eq("revenda_id", revendaId).in("placa", religar);
    revalidar();
    return deuCerto(
      [novas.length && `${novas.length} cadastrada(s)`, religar.length && `${religar.length} reativada(s)`, placas.length - novas.length - religar.length && `${placas.length - novas.length - religar.length} já existia(m)`]
        .filter(Boolean)
        .join(" · ") + ".",
    );
  });
}

export async function salvarVeiculo(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = String(fd.get("veiculo_id") ?? "");
    const pessoa = String(fd.get("responsavel_id") ?? "");
    const descricao = String(fd.get("descricao") ?? "").trim().slice(0, 80) || null;
    let responsavel: { id: string; nome: string } | null = null;
    if (pessoa) {
      const { data: vinc } = await admin
        .from("colaborador_revendas")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", pessoa)
        .maybeSingle();
      if (!vinc) pararComErro("Essa pessoa não é desta revenda.");
      const { data: p } = await admin.from("profiles").select("id, nome").eq("id", pessoa).maybeSingle();
      if (!p) pararComErro("Pessoa não encontrada.");
      responsavel = { id: p.id, nome: p.nome };
    }
    const patch: Record<string, unknown> = { descricao };
    if (pessoa) Object.assign(patch, { responsavel_id: responsavel!.id, responsavel_nome: responsavel!.nome });
    else if (fd.get("limpar") === "1") Object.assign(patch, { responsavel_id: null });
    const { error } = await admin.from("cf_veiculos").update(patch).eq("id", id).eq("revenda_id", revendaId);
    if (error) pararComErro(`Não salvou: ${error.message}`);
    if (responsavel) {
      const eu = await getPerfil();
      await admin
        .from("colaborador_modulos_extra")
        .upsert(
          { colaborador_id: responsavel.id, revenda_id: revendaId, modulo: MODULO_FROTA_CHECK, liberado_por: eu?.id ?? null },
          { onConflict: "colaborador_id,revenda_id,modulo", ignoreDuplicates: true },
        );
    }
    revalidar();
    return deuCerto(responsavel ? `Salvo: ${responsavel.nome.split(" ")[0]} responde pela placa e já abre o Check da Frota.` : "Salvo.");
  });
}

/** Mesma pessoa para várias placas de uma vez (as que ainda têm só o nome da planilha). */
export async function trocarResponsavelEmMassa(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const nome = String(fd.get("nome_planilha") ?? "");
    const pessoa = String(fd.get("responsavel_id") ?? "");
    if (!nome || !pessoa) pararComErro("Escolha a pessoa.");
    const { data: p } = await admin.from("profiles").select("id, nome").eq("id", pessoa).maybeSingle();
    if (!p) pararComErro("Pessoa não encontrada.");
    const { data, error } = await admin
      .from("cf_veiculos")
      .update({ responsavel_id: p.id, responsavel_nome: p.nome })
      .eq("revenda_id", revendaId)
      .eq("responsavel_nome", nome)
      .is("responsavel_id", null)
      .select("id");
    if (error) pararComErro(`Não salvou: ${error.message}`);
    const eu = await getPerfil();
    await admin
      .from("colaborador_modulos_extra")
      .upsert(
        { colaborador_id: p.id, revenda_id: revendaId, modulo: MODULO_FROTA_CHECK, liberado_por: eu?.id ?? null },
        { onConflict: "colaborador_id,revenda_id,modulo", ignoreDuplicates: true },
      );
    revalidar();
    return deuCerto(`${data?.length ?? 0} placas passaram para ${p.nome.split(" ")[0]}.`);
  });
}

export async function alternarVeiculo(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = String(fd.get("veiculo_id") ?? "");
    const ativo = fd.get("ativo") === "1";
    const { error } = await admin.from("cf_veiculos").update({ ativo }).eq("id", id).eq("revenda_id", revendaId);
    if (error) pararComErro(`Não salvou: ${error.message}`);
    revalidar();
    return deuCerto(ativo ? "Placa reativada." : "Placa desativada (o histórico fica).");
  });
}
