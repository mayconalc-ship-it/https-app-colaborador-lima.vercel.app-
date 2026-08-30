"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { CATALOGO_DE_METAS, lerValorDeMeta } from "@/lib/metas";

const ROTA = "/admin/metas";

/**
 * Volta para a tela EXATAMENTE como ela estava: mesmos grupos abertos,
 * mesma busca, mesma página. O formulário manda o estado num campo
 * escondido e ele volta inteiro na URL.
 *
 * É o que faz cadastrar quinze metas ser quinze cliques em vez de
 * quinze cliques mais quinze vezes reabrir e refiltrar.
 */
function voltar(formData: FormData, chave: "sucesso" | "erro", mensagem: string): never {
  const p = new URLSearchParams(String(formData.get("estado") ?? ""));
  p.set(chave, mensagem);
  redirect(`${ROTA}?${p.toString()}`);
}

async function contexto() {
  await requireModulo("metas", "editar");
  const revendaId = await getRevendaId();
  const perfil = await getPerfil();
  return { revendaId, perfil };
}

/**
 * Salva um grupo inteiro de uma vez.
 *
 * O grupo é a unidade de salvamento de propósito: quem abriu "Entrega"
 * quer cadastrar as três metas dali e clicar uma vez. Um botão por campo
 * transformaria o cadastro numa maratona de cliques.
 *
 * Campo deixado em branco APAGA a meta -- é assim que se volta ao cartão
 * neutro depois de descobrir que a régua estava errada.
 */
export async function salvarMetas(formData: FormData) {
  const { revendaId, perfil } = await contexto();
  if (!revendaId) voltar(formData, "erro", "Você não está em nenhuma revenda.");

  const grupo = String(formData.get("grupo") ?? "");
  const doGrupo = CATALOGO_DE_METAS.filter((m) => m.grupo === grupo);
  if (doGrupo.length === 0) voltar(formData, "erro", "Grupo inválido.");

  const admin = createAdminClient();

  // Valida TUDO antes de gravar QUALQUER coisa: salvar metade e recusar o
  // resto deixaria a tela dizendo "erro" com parte já gravada.
  const paraGravar: { def: (typeof doGrupo)[number]; valor: number | null }[] = [];
  for (const def of doGrupo) {
    const lido = lerValorDeMeta(formData.get(`meta_${def.chave}`));
    if (lido === "invalido") {
      voltar(formData, "erro", `"${def.rotulo}": informe um número igual ou maior que zero.`);
    }
    paraGravar.push({ def, valor: lido });
  }

  const agora = new Date().toISOString();

  for (const { def, valor } of paraGravar) {
    if (def.fonte === "pa_metas") {
      if (valor === null) {
        await admin.from("pa_metas").delete().eq("revenda_id", revendaId).eq("chave", def.chave);
      } else {
        const { error } = await admin.from("pa_metas").upsert(
          {
            revenda_id: revendaId,
            chave: def.chave,
            valor,
            atualizado_em: agora,
            atualizado_por: perfil?.id ?? null,
            atualizado_por_nome: perfil?.nome ?? null,
          },
          { onConflict: "revenda_id,chave" },
        );
        if (error) voltar(formData, "erro", `Não foi possível salvar: ${error.message}`);
      }
      continue;
    }

    // As metas que já moravam numa config continuam lá.
    const tabela = def.fonte === "recebimento_config" ? "pa_recebimento_config" : "devolucao_config";
    const { error } = await admin
      .from(tabela)
      .upsert(
        { revenda_id: revendaId, [def.coluna as string]: valor },
        { onConflict: "revenda_id" },
      );
    if (error) voltar(formData, "erro", `Não foi possível salvar: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/indicadores");
  revalidatePath("/devolucao");
  voltar(formData, "sucesso", `Metas de ${grupo.replace("-", " ")} salvas.`);
}

/**
 * Metas por PRODUTO (Repack) e por EMBALAGEM (Despejo).
 *
 * Ficam separadas porque não são uma meta só: são dezenas, uma por item,
 * e a tela lista com busca. Grava só o que veio no formulário -- o filtro
 * de busca some com o resto da lista, e apagar o que não apareceu seria
 * zerar meta de produto que a pessoa nem viu.
 */
export async function salvarMetasPorItem(formData: FormData) {
  const { revendaId } = await contexto();
  if (!revendaId) voltar(formData, "erro", "Você não está em nenhuma revenda.");

  const tipo = String(formData.get("tipo") ?? "");
  const config =
    tipo === "reepack"
      ? { tabela: "pa_produtos", coluna: "meta_reepack_hora", rotulo: "Repack" }
      : tipo === "despejo"
        ? { tabela: "pa_embalagens_despejo", coluna: "meta_litros_hora", rotulo: "Despejo" }
        : null;
  if (!config) voltar(formData, "erro", "Tipo inválido.");

  const admin = createAdminClient();

  const alteracoes: { id: string; valor: number | null }[] = [];
  for (const [campo, bruto] of formData.entries()) {
    if (!campo.startsWith("item_")) continue;
    const id = campo.slice("item_".length);
    const lido = lerValorDeMeta(bruto);
    if (lido === "invalido") {
      voltar(formData, "erro", "Meta inválida: informe um número igual ou maior que zero.");
    }
    alteracoes.push({ id, valor: lido });
  }

  for (const { id, valor } of alteracoes) {
    const { error } = await admin
      .from(config.tabela)
      .update({ [config.coluna]: valor })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) voltar(formData, "erro", `Não foi possível salvar: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/produtividade-armazem/indicadores");
  voltar(formData, "sucesso", `${alteracoes.length} meta(s) de ${config.rotulo} salva(s).`);
}
