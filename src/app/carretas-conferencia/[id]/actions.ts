"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoCarretas } from "@/lib/carretas-server";
import { ehUnidadeItem, quantidadePositiva } from "@/lib/carretas";

function rota(id: string) {
  return `/carretas-conferencia/${id}`;
}

function erro(id: string, mensagem: string): never {
  redirect(`${rota(id)}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * O conferente assume o card e preenche os itens da descarga na mesma
 * submissão -- é o mesmo instante que vira "início da descarga" (decisão
 * tomada na conversa que gerou este recurso, ver migration 057).
 */
export async function assumirEDescarregar(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const produtoIds = formData.getAll("produto_id").map(String);
  const quantidades = formData.getAll("quantidade").map(String);
  const unidades = formData.getAll("unidade").map(String);
  const lotes = formData.getAll("lote").map(String);
  const validades = formData.getAll("validade").map(String);
  const empilhadores = formData.getAll("empilhador").map(String);

  if (produtoIds.length === 0 || produtoIds.some((id) => !id)) {
    erro(atendimentoId, "Adicione ao menos um item com o produto escolhido.");
  }

  const itens = produtoIds.map((produtoId, i) => {
    let quantidade: number;
    try {
      quantidade = quantidadePositiva(quantidades[i]);
    } catch {
      erro(atendimentoId, "Quantidade inválida em um dos itens.");
    }
    const unidade = unidades[i];
    if (!ehUnidadeItem(unidade)) erro(atendimentoId, "Escolha a unidade (palete/caixa) de cada item.");
    const lote = (lotes[i] ?? "").trim();
    const validade = (validades[i] ?? "").trim();
    const empilhador = (empilhadores[i] ?? "").trim();
    if (!lote) erro(atendimentoId, "Informe o lote de cada item.");
    if (!validade) erro(atendimentoId, "Informe a validade de cada item.");
    if (!empilhador) erro(atendimentoId, "Informe o empilhador de cada item.");
    return { produtoId, quantidade, unidade, lote, validade, empilhador };
  });

  const supabase = await createClient();

  const { error: erroItens } = await supabase.from("atendimento_carretas_itens").insert(
    itens.map((i) => ({
      revenda_id: revendaId,
      atendimento_id: atendimentoId,
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      unidade: i.unidade,
      lote: i.lote,
      validade: i.validade,
      empilhador: i.empilhador,
    })),
  );
  if (erroItens) erro(atendimentoId, `Não foi possível salvar os itens: ${erroItens.message}`);

  const agora = new Date().toISOString();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({
      conferente_colaborador_id: perfil.id,
      conferente_nome: perfil.nome,
      inicio_atendimento_em: agora,
      status: "em_descarga",
    })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("status", "aguardando_conferente")
    .select("id");

  if (error) erro(atendimentoId, `Itens salvos, mas não foi possível assumir: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "Este atendimento já foi assumido por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+iniciada`);
}

/**
 * "Retorno vazio" (sem AG) segue exatamente o antigo "não" (finaliza
 * direto). "Retorno com AG" segue o antigo "sim" (abre a fase de carga),
 * só que agora grava destino + itens de AG junto -- a pergunta mudou pra
 * refletir como a operação de verdade funciona (a carreta quase sempre
 * volta com Ativo de Giro, não "outra carga qualquer").
 */
export async function concluirDescarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");
  const retornaComAg = formData.get("retorno") === "com_ag";

  let destinoRetorno: string | null = null;
  let itensAg: { agId: string; quantidade: number }[] = [];

  if (retornaComAg) {
    destinoRetorno = String(formData.get("destino_retorno") ?? "").trim();
    if (!destinoRetorno) erro(atendimentoId, "Informe o destino da carreta.");

    const agIds = formData.getAll("ag_id").map(String);
    const quantidades = formData.getAll("ag_quantidade").map(String);
    if (agIds.length === 0 || agIds.some((v) => !v)) {
      erro(atendimentoId, "Escolha o AG de cada item.");
    }
    itensAg = agIds.map((agId, i) => {
      let quantidade: number;
      try {
        quantidade = quantidadePositiva(quantidades[i]);
      } catch {
        erro(atendimentoId, "Quantidade inválida em um dos itens de AG.");
      }
      return { agId, quantidade };
    });
  }

  const agora = new Date().toISOString();
  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update(
      retornaComAg
        ? { fim_descarga_em: agora, tem_carga: true, inicio_carga_em: agora, status: "em_carga", destino_retorno: destinoRetorno }
        : { fim_descarga_em: agora, tem_carga: false, finalizacao_em: agora, status: "finalizado" },
    )
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("status", "em_descarga")
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível concluir a descarga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "Este atendimento já foi atualizado por outra pessoa.");

  if (itensAg.length > 0) {
    const { error: erroAg } = await supabase.from("atendimento_carretas_ag_itens").insert(
      itensAg.map((i) => ({
        revenda_id: revendaId,
        atendimento_id: atendimentoId,
        ag_id: i.agId,
        quantidade: i.quantidade,
      })),
    );
    if (erroAg) erro(atendimentoId, `Descarga concluída, mas os itens de AG falharam: ${erroAg.message}`);
  }

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+concluída`);
}

export async function concluirCarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const agora = new Date().toISOString();
  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ fim_carga_em: agora, finalizacao_em: agora, status: "finalizado" })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("status", "em_carga")
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível concluir a carga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "Este atendimento já foi atualizado por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Atendimento+finalizado`);
}
