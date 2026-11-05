"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { itensDoModelo } from "@/lib/manutencao-preventiva-server";
import {
  erroDaResposta,
  itemVisivel,
  paraNumero,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";

const ROTA = "/manutencao-preventiva";

function erro(mensagem: string, destino = ROTA): never {
  redirect(`${destino}?erro=${encodeURIComponent(mensagem)}`);
}

/** Abre uma preventiva. O índice parcial no banco segura o clique duplo. */
export async function iniciarPreventiva(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);

  const modeloId = String(formData.get("modelo_id") ?? "");
  if (!modeloId) erro("Escolha o equipamento.");

  const admin = createAdminClient();
  const { data: modelo } = await admin
    .from("manut_prev_modelos")
    .select("id")
    .eq("id", modeloId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!modelo) erro("Este checklist não está disponível.");

  // Já tem uma aberta sua? Continua nela em vez de criar outra.
  const { data: aberta } = await admin
    .from("manut_prev_execucoes")
    .select("id")
    .eq("modelo_id", modeloId)
    .eq("iniciada_por", perfil.id)
    .eq("status", "em_andamento")
    .maybeSingle();
  if (aberta) redirect(`${ROTA}/${aberta.id}`);

  const { data: criada, error } = await admin
    .from("manut_prev_execucoes")
    .insert({
      revenda_id: revendaId,
      modelo_id: modeloId,
      iniciada_por: perfil.id,
      iniciada_por_nome: perfil.nome,
    })
    .select("id")
    .single();

  if (error) erro(`Não foi possível iniciar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}/${criada.id}`);
}

/**
 * Salva as respostas e finaliza. Tudo de uma vez, com um Salvar só no
 * fim -- é uma grade de campos do mesmo assunto, não vinte formulários.
 *
 * A validação roda aqui DE NOVO, item a item: a tela já valida, mas
 * esconder o campo nunca foi validação.
 */
export async function finalizarPreventiva(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);

  const execucaoId = String(formData.get("execucao_id") ?? "");
  if (!execucaoId) erro("Preventiva inválida.");
  const destino = `${ROTA}/${execucaoId}`;

  const admin = createAdminClient();
  const { data: execucao } = await admin
    .from("manut_prev_execucoes")
    .select("id, modelo_id, iniciada_por, status")
    .eq("id", execucaoId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!execucao) erro("Preventiva não encontrada.");
  if (execucao.status === "finalizada") erro("Esta preventiva já foi finalizada.", destino);
  if (execucao.iniciada_por !== perfil.id) {
    erro("Só quem iniciou esta preventiva pode finalizá-la.", destino);
  }

  const itens = await itensDoModelo(execucao.modelo_id, revendaId);

  // Monta as respostas a partir do formulário.
  const respostas = new Map<string, RespostaPreventiva>();
  for (const item of itens) {
    const bruto = formData.get(`item_${item.id}`);
    const obs = String(formData.get(`obs_${item.id}`) ?? "").trim().slice(0, 500) || null;

    const r: RespostaPreventiva = {
      itemId: item.id,
      valorBool: null,
      valorNumero: null,
      valorNumeros: null,
      valorTexto: null,
      observacao: obs,
    };

    switch (item.tipo) {
      case "sim_nao":
        r.valorBool = bruto === "true" ? true : bruto === "false" ? false : null;
        break;
      case "numero":
      case "nota":
        r.valorNumero = paraNumero(bruto);
        break;
      case "trifasico": {
        const fases = ["l1", "l2", "l3"].map((f) => paraNumero(formData.get(`item_${item.id}_${f}`)));
        r.valorNumeros = fases.every((n) => n !== null) ? (fases as number[]) : null;
        break;
      }
      default:
        r.valorTexto = String(bruto ?? "").trim().slice(0, 500) || null;
    }
    respostas.set(item.id, r);
  }

  // Valida só o que estava VISÍVEL: pergunta condicional escondida não
  // pode cobrar resposta (foi o que encheu o Forms de "ID").
  for (const item of itens) {
    if (!itemVisivel(item, itens, respostas)) {
      respostas.delete(item.id);
      continue;
    }
    const problema = erroDaResposta(item, respostas.get(item.id));
    if (problema) erro(`"${item.pergunta}": ${problema}`, destino);
  }

  const linhas = [...respostas.values()].map((r) => ({
    execucao_id: execucaoId,
    item_id: r.itemId,
    revenda_id: revendaId,
    valor_bool: r.valorBool,
    valor_numero: r.valorNumero,
    valor_numeros: r.valorNumeros,
    valor_texto: r.valorTexto,
    observacao: r.observacao,
  }));

  const { error: erroResp } = await admin
    .from("manut_prev_respostas")
    .upsert(linhas, { onConflict: "execucao_id,item_id" });
  if (erroResp) erro(`Não foi possível salvar as respostas: ${erroResp.message}`, destino);

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 1000) || null;
  const { error: erroFim } = await admin
    .from("manut_prev_execucoes")
    .update({
      status: "finalizada",
      finalizada_por: perfil.id,
      finalizada_por_nome: perfil.nome,
      finalizada_em: new Date().toISOString(),
      observacao,
    })
    .eq("id", execucaoId)
    .eq("status", "em_andamento");
  if (erroFim) erro(`Respostas salvas, mas não foi possível finalizar: ${erroFim.message}`, destino);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Preventiva registrada.")}`);
}

/** Desiste de uma preventiva aberta por engano -- some sem virar histórico. */
export async function cancelarPreventiva(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);
  const execucaoId = String(formData.get("execucao_id") ?? "");
  if (!execucaoId) erro("Preventiva inválida.");

  const admin = createAdminClient();
  await admin
    .from("manut_prev_execucoes")
    .delete()
    .eq("id", execucaoId)
    .eq("revenda_id", revendaId)
    .eq("iniciada_por", perfil.id)
    .eq("status", "em_andamento");

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Preventiva cancelada.")}`);
}
