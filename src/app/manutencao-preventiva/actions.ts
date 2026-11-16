"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { FOTOS_POR_ITEM, guardarFotosDoItem, itensDoModelo } from "@/lib/manutencao-preventiva-server";
import {
  emAlerta,
  erroDaResposta,
  itemVisivel,
  paraNumero,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";

const ROTA = "/manutencao-preventiva";

function erro(mensagem: string, destino = ROTA): never {
  redirect(`${destino}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Abre uma preventiva -- de um modelo, ou de UM aparelho dele (16/11/2026).
 * O índice parcial no banco segura o clique duplo.
 */
export async function iniciarPreventiva(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);

  const modeloId = String(formData.get("modelo_id") ?? "");
  const equipamentoId = String(formData.get("equipamento_id") ?? "") || null;
  if (!modeloId) erro("Escolha o equipamento.");

  const admin = createAdminClient();
  const { data: modelo } = await admin
    .from("manut_prev_modelos")
    .select("id, usa_equipamentos")
    .eq("id", modeloId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!modelo) erro("Este checklist não está disponível.");

  if (modelo.usa_equipamentos) {
    if (!equipamentoId) erro("Escolha qual aparelho.");
    const { data: equip } = await admin
      .from("manut_prev_equipamentos")
      .select("id")
      .eq("id", equipamentoId)
      .eq("modelo_id", modeloId)
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .maybeSingle();
    if (!equip) erro("Este aparelho não está mais cadastrado.");
  }
  const equipamento = modelo.usa_equipamentos ? equipamentoId : null;
  await abrirExecucao(admin, perfil, revendaId, modeloId, equipamento);
}

/**
 * O + da tela (16/11/2026): o aparelho na frente do técnico ainda não está
 * no cadastro. Quem tem a permissão de cadastro (Liderança "editar")
 * cadastra e já abre a preventiva dele, sem ir ao Modo Liderança.
 */
export async function cadastrarEIniciar(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);
  if (!(await podeNoModulo("manutencao-preventiva", "editar"))) {
    erro("Só a liderança cadastra aparelho. Peça para incluir no Modo Liderança.");
  }

  const limpo = (c: string, max: number) =>
    String(formData.get(c) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const modeloId = limpo("modelo_id", 40);
  const codigo = limpo("codigo", 30).toUpperCase();
  const local = limpo("local", 80);
  if (!codigo) erro("Informe o código do aparelho (a etiqueta, ex.: AC-03).");

  const admin = createAdminClient();
  const { data: modelo } = await admin
    .from("manut_prev_modelos")
    .select("id")
    .eq("id", modeloId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .eq("usa_equipamentos", true)
    .maybeSingle();
  if (!modelo) erro("Checklist não encontrado.");

  const { data: criado, error } = await admin
    .from("manut_prev_equipamentos")
    .insert({ revenda_id: revendaId, modelo_id: modeloId, codigo, local })
    .select("id")
    .single();
  if (error) {
    erro(
      error.code === "23505"
        ? `Já existe um aparelho com o código ${codigo}. Escolha ele na lista.`
        : `Não foi possível cadastrar: ${error.message}`,
    );
  }
  revalidatePath("/admin/manutencao-preventiva");
  await abrirExecucao(admin, perfil, revendaId, modeloId, criado.id);
}

/** Continua a aberta da pessoa para este alvo, ou abre uma nova. */
async function abrirExecucao(
  admin: ReturnType<typeof createAdminClient>,
  perfil: { id: string; nome: string },
  revendaId: string,
  modeloId: string,
  equipamento: string | null,
): Promise<never> {
  // Já tem uma aberta sua deste alvo? Continua nela em vez de criar outra.
  let busca = admin
    .from("manut_prev_execucoes")
    .select("id")
    .eq("modelo_id", modeloId)
    .eq("iniciada_por", perfil.id)
    .eq("status", "em_andamento");
  busca = equipamento ? busca.eq("equipamento_id", equipamento) : busca.is("equipamento_id", null);
  const { data: aberta } = await busca.maybeSingle();
  if (aberta) redirect(`${ROTA}/${aberta.id}`);

  const { data: criada, error } = await admin
    .from("manut_prev_execucoes")
    .insert({
      revenda_id: revendaId,
      modelo_id: modeloId,
      equipamento_id: equipamento,
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
 * Salva as respostas, as fotos e finaliza. Tudo de uma vez, com um Salvar
 * só no fim -- é uma grade de campos do mesmo assunto, não vinte
 * formulários.
 *
 * A validação roda aqui DE NOVO, item a item: a tela já valida, mas
 * esconder o campo nunca foi validação. O alerta também é recalculado
 * aqui: o número que o painel conta não pode depender da tela.
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
    .select("id, revenda_id, modelo_id, iniciada_por, status")
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

  const porId = new Map(itens.map((i) => [i.id, i]));
  let alertas = 0;
  const linhas = [...respostas.values()].map((r) => {
    const alerta = emAlerta(porId.get(r.itemId)!, r);
    if (alerta) alertas++;
    return {
      execucao_id: execucaoId,
      item_id: r.itemId,
      revenda_id: revendaId,
      valor_bool: r.valorBool,
      valor_numero: r.valorNumero,
      valor_numeros: r.valorNumeros,
      valor_texto: r.valorTexto,
      observacao: r.observacao,
      alerta,
    };
  });

  const { error: erroResp } = await admin
    .from("manut_prev_respostas")
    .upsert(linhas, { onConflict: "execucao_id,item_id" });
  if (erroResp) erro(`Não foi possível salvar as respostas: ${erroResp.message}`, destino);

  // Fotos: chegam já reduzidas pelo celular; o servidor ainda passa para
  // WebP de 1280 px. Uma que falhe não segura a preventiva.
  let falhasDeFoto = 0;
  for (const item of itens) {
    if (!item.aceitaFoto || !respostas.has(item.id)) continue;
    const arquivos = formData
      .getAll(`foto_${item.id}`)
      .filter((f): f is File => f instanceof File && f.size > 0)
      .slice(0, FOTOS_POR_ITEM);
    if (arquivos.length > 0) falhasDeFoto += await guardarFotosDoItem(execucao, item.id, arquivos, admin);
  }

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 1000) || null;
  const { error: erroFim } = await admin
    .from("manut_prev_execucoes")
    .update({
      status: "finalizada",
      finalizada_por: perfil.id,
      finalizada_por_nome: perfil.nome,
      finalizada_em: new Date().toISOString(),
      observacao,
      alertas,
    })
    .eq("id", execucaoId)
    .eq("status", "em_andamento");
  if (erroFim) erro(`Respostas salvas, mas não foi possível finalizar: ${erroFim.message}`, destino);

  revalidatePath(ROTA);
  revalidatePath("/manutencao-central");
  const partes = ["Preventiva registrada."];
  if (alertas > 0) partes.push(`${alertas} ${alertas === 1 ? "item ficou" : "itens ficaram"} em alerta.`);
  if (falhasDeFoto > 0) partes.push(`${falhasDeFoto} foto(s) não subiram.`);
  const params = new URLSearchParams({ sucesso: partes.join(" ") });
  if (alertas > 0) params.set("alertas", execucaoId);
  redirect(`${ROTA}?${params.toString()}`);
}

/** Desiste de uma preventiva aberta por engano -- some sem virar histórico. */
export async function cancelarPreventiva(formData: FormData) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const revendaId = await exigirRevenda(ROTA);
  const execucaoId = String(formData.get("execucao_id") ?? "");
  if (!execucaoId) erro("Preventiva inválida.");

  // Quem iniciou cancela a sua; a liderança com "editar" cancela também a
  // que alguém abriu e largou (16/11/2026).
  const admin = createAdminClient();
  let apagar = admin
    .from("manut_prev_execucoes")
    .delete()
    .eq("id", execucaoId)
    .eq("revenda_id", revendaId)
    .eq("status", "em_andamento");
  if (!(await podeNoModulo("manutencao-preventiva", "editar"))) apagar = apagar.eq("iniciada_por", perfil.id);
  const { error } = await apagar;
  if (error) erro(`Não foi possível cancelar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Preventiva cancelada.")}`);
}
