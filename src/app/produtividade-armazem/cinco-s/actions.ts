"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";

const ROTA = "/produtividade-armazem/cinco-s";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo("pa-cinco-s", ROTA);

export async function iniciarExecucao5s() {
  const { perfil, revendaId } = await exigirContexto();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pa_execucoes_5s")
    .insert({ revenda_id: revendaId, responsavel_id: perfil.id, responsavel_nome: perfil.nome })
    .select("id")
    .single();

  if (error || !data) erro(`Não foi possível iniciar: ${error?.message ?? "resposta vazia do banco"}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}/${data.id}`);
}

export async function finalizarExecucao5s(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const execucaoId = String(formData.get("execucao_id") ?? "");
  if (!execucaoId) erro("Execução inválida.");

  const observacoes = String(formData.get("observacoes") ?? "").trim().slice(0, 500) || null;
  const itens = formData.getAll("item_id").map(String).filter(Boolean);

  const supabase = await createClient();

  const { data: execucao } = await supabase
    .from("pa_execucoes_5s")
    .select("id")
    .eq("id", execucaoId)
    .eq("revenda_id", revendaId)
    .eq("responsavel_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!execucao) erro("Esta execução já foi encerrada ou não é sua.");

  if (itens.length > 0) {
    const { error: erroItens } = await supabase
      .from("pa_execucao_5s_itens")
      .insert(itens.map((itemId) => ({ execucao_id: execucaoId, item_id: itemId })));
    if (erroItens) erro(`Não foi possível salvar o checklist: ${erroItens.message}`);
  }

  const { error } = await supabase
    .from("pa_execucoes_5s")
    .update({ fim: new Date().toISOString(), observacoes })
    .eq("id", execucaoId)
    .eq("responsavel_id", perfil.id);

  if (error) erro(`Não foi possível encerrar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${execucaoId}`);
  redirect(`${ROTA}?sucesso=5S+registrado`);
}
