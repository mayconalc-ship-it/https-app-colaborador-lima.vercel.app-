"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`/admin/pesquisa?${chave}=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) || "").trim();
}

export async function salvarConfigPesquisa(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ciclo = texto(formData, "ciclo");
  const titulo = texto(formData, "titulo") || "Pesquisa de satisfação";
  const inicio = texto(formData, "inicio") || null;
  const fim = texto(formData, "fim") || null;

  if (!/^\d{4}-\d{2}$/.test(ciclo)) {
    voltar("erro", "O ciclo precisa estar no formato AAAA-MM. Ex: 2026-08");
  }
  if (inicio && fim && fim < inicio) {
    voltar("erro", "A data final não pode ser antes da inicial.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("pesquisa_config")
    .update({ ciclo, titulo, inicio, fim, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar("sucesso", "Configuração salva.");
}

export async function alternarPesquisa(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ligar = formData.get("ligar") === "true";
  const admin = createAdminClient();

  const { error } = await admin
    .from("pesquisa_config")
    .update({ ativa: ligar, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar(
    "sucesso",
    ligar
      ? "Pesquisa ativada. Ela aparece no próximo acesso de cada colaborador."
      : "Pesquisa desativada.",
  );
}

/**
 * Começa um ciclo novo.
 *
 * Não apaga nada: apenas troca o valor do ciclo. As respostas antigas ficam
 * guardadas com o ciclo em que foram dadas, e todo mundo volta a poder
 * responder -- porque a trava de duplicidade é por (pessoa + ciclo).
 */
export async function novoCiclo(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ciclo = texto(formData, "novo_ciclo");
  if (!/^\d{4}-\d{2}$/.test(ciclo)) {
    voltar("erro", "Informe o ciclo no formato AAAA-MM. Ex: 2026-09");
  }

  const admin = createAdminClient();

  const { data: atual } = await admin
    .from("pesquisa_config")
    .select("ciclo")
    .eq("id", 1)
    .maybeSingle();

  if (atual?.ciclo === ciclo) {
    voltar("erro", `O ciclo ${ciclo} já é o ciclo atual.`);
  }

  const { error } = await admin
    .from("pesquisa_config")
    .update({ ciclo, ativa: true, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar(
    "sucesso",
    `Ciclo ${ciclo} iniciado. Todos os colaboradores podem responder de novo — as respostas anteriores continuam guardadas.`,
  );
}
