"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";
import { ehTurno } from "@/lib/produtividade-armazem";
import {
  TIPO_ABASTECIMENTO,
  calcularHl,
  ehTipoAbastecimento,
  ehUnidadeAbastecimento,
} from "@/lib/abastecimento";

const ROTA = "/produtividade-armazem/abastecimento";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

// Mesma concessão do módulo que ele substitui: quem já abastecia picking
// continua entrando, sem ninguém ter que reconceder acesso pessoa a
// pessoa na Gestão de Acessos.
const exigirContexto = () => exigirContextoModulo("pa-picking", ROTA);

/**
 * Abre a sessão: grava o início AGORA, no servidor -- não no relógio do
 * celular, que cada um acerta como quer. `fim` nulo é o que marca a
 * sessão em andamento.
 *
 * A trava contra duas sessões abertas ao mesmo tempo é o índice único
 * parcial (migration 071); aqui só traduzimos a violação em português.
 */
export async function iniciarAbastecimento(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const tipo = formData.get("tipo");
  const turno = formData.get("turno");
  if (!ehTipoAbastecimento(tipo)) erro("Escolha o tipo de abastecimento.");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();
  const { error } = await supabase.from("pa_abastecimentos").insert({
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    tipo,
    turno,
    inicio: new Date().toISOString(),
    status: "em_andamento",
  });

  if (error) {
    if (error.code === "23505") {
      erro("Você já tem um abastecimento em andamento. Finalize antes de iniciar outro.");
    }
    erro(`Não foi possível iniciar: ${error.message}`);
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent(`${TIPO_ABASTECIMENTO[tipo].rotulo} iniciado`)}`);
}

/**
 * Acrescenta um item à sessão aberta. O HL é calculado AQUI, no servidor,
 * a partir do cadastro do produto, e gravado -- se o fator mudar amanhã,
 * o que já foi abastecido continua valendo o que valia (mesmo desenho do
 * litro do reepack).
 *
 * Produto sem os fatores necessários é RECUSADO em vez de entrar valendo
 * zero: um item invisível no total é pior do que uma mensagem de erro.
 */
export async function adicionarItem(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const abastecimentoId = String(formData.get("abastecimento_id") ?? "");
  const produtoId = String(formData.get("produto_id") ?? "");
  const unidade = formData.get("unidade");

  if (!abastecimentoId) erro("Sessão inválida.");
  if (!produtoId) erro("Escolha o produto.");
  if (!ehUnidadeAbastecimento(unidade)) erro("Escolha se é caixa ou palete.");

  const quantidade = Number(String(formData.get("quantidade") ?? "").replace(",", "."));
  if (!Number.isFinite(quantidade) || quantidade <= 0) erro("Informe uma quantidade maior que zero.");
  if (quantidade > 100_000) erro("Quantidade fora do razoável -- confira o que digitou.");

  const supabase = await createClient();

  // A sessão precisa estar aberta E ser da própria pessoa: sem isso, um
  // id copiado da URL deixaria lançar item na sessão de outro.
  const { data: sessao } = await supabase
    .from("pa_abastecimentos")
    .select("id, ressuprimento_id")
    .eq("id", abastecimentoId)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!sessao) erro("Este abastecimento já foi finalizado ou não é seu.");

  // Sessão que atende a uma solicitação é fechada: o que se abastece é o
  // que foi pedido. A tela já não mostra o formulário, mas esconder botão
  // não é regra -- a regra mora aqui, senão um envio direto continuaria
  // passando.
  //
  // Sem isso, alguém aproveitaria a sessão aberta para lançar mais um
  // item que ninguém pediu, e o tempo de ciclo passaria a medir dois
  // trabalhos diferentes como se fossem um.
  if (sessao.ressuprimento_id) {
    erro(
      "Este abastecimento atende a uma solicitação e a lista é a que foi pedida. Para outro produto, abra uma nova solicitação.",
    );
  }

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("id, descricao, fator_hecto, caixas_pallet")
    .eq("id", produtoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!produto) erro("Produto não encontrado.");

  const fatores = { fatorHecto: produto.fator_hecto, caixasPallet: produto.caixas_pallet };
  const hl = calcularHl(quantidade, unidade, fatores);

  if (hl === null) {
    erro(
      unidade === "palete"
        ? `${produto.descricao} não tem "caixas por palete" no cadastro -- lance em caixa ou peça ao Admin para completar.`
        : `${produto.descricao} não tem Fator Hecto no cadastro -- peça ao Admin para completar em Configuração.`,
    );
  }

  const { error } = await supabase.from("pa_abastecimento_itens").insert({
    revenda_id: revendaId,
    abastecimento_id: abastecimentoId,
    produto_id: produto.id,
    unidade,
    quantidade,
    hl_calculado: hl,
  });

  if (error) erro(`Não foi possível adicionar o item: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent(`${produto.descricao} — ${hl} HL`)}`);
}

/** Tira um item lançado errado, enquanto a sessão ainda está aberta. */
export async function removerItem(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Item inválido.");

  const supabase = await createClient();

  // O RLS já barra item de sessão alheia, mas a checagem de sessão ABERTA
  // é regra de negócio, não de acesso: item de sessão fechada vira
  // estatística, e apagar isso é exclusão de lançamento, não correção.
  const { data: item } = await supabase
    .from("pa_abastecimento_itens")
    .select("id, abastecimento_id, pa_abastecimentos!inner(colaborador_id, fim)")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const sessao = item?.pa_abastecimentos as unknown as { colaborador_id: string; fim: string | null } | undefined;
  if (!item || !sessao || sessao.colaborador_id !== perfil.id || sessao.fim !== null) {
    erro("Só dá para remover item de um abastecimento seu que ainda está aberto.");
  }

  await supabase.from("pa_abastecimento_itens").delete().eq("id", id);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Item+removido`);
}

/**
 * Fecha a sessão: grava fim = agora e status concluído. Os totais (HL,
 * paletes, HL/h, min/HL) NÃO são gravados -- saem dos itens na leitura,
 * porque um total gravado que discorde dos itens é pior do que total
 * nenhum. Ver resumirAbastecimento em lib/abastecimento.ts.
 */
export async function finalizarAbastecimento(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  // Sem item, a sessão não mede nada: o tempo existiria sem HL nenhum e
  // entraria no indicador como produtividade zero.
  const { count } = await supabase
    .from("pa_abastecimento_itens")
    .select("*", { count: "exact", head: true })
    .eq("abastecimento_id", id);

  if (!count) erro("Informe pelo menos um produto antes de finalizar.");

  const { error } = await supabase
    .from("pa_abastecimentos")
    .update({ fim: new Date().toISOString(), status: "concluido", observacao })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Abastecimento+finalizado`);
}

/** Desiste de uma sessão aberta por engano -- some sem virar estatística.
 *  Os itens vão junto pelo cascade da FK. */
export async function cancelarAbastecimento(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const supabase = await createClient();
  await supabase
    .from("pa_abastecimentos")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Abastecimento+cancelado`);
}

/** Exclui uma sessão já finalizada. Quem lançou apaga a própria; a
 *  liderança com "excluir" apaga qualquer uma -- mesma regra do reepack. */
export async function excluirAbastecimento(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const gestor = await podeNoModulo("produtividade-armazem", "excluir");
  if (gestor) {
    const admin = createAdminClient();
    await admin.from("pa_abastecimentos").delete().eq("id", id).eq("revenda_id", revendaId);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pa_abastecimentos")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id);
    if (error) erro("Você só pode excluir os próprios abastecimentos.");
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Abastecimento+excluído`);
}

/**
 * Busca de produto do combobox -- MESMO formato do Reepack (Cluster →
 * Tipo → digitar), que é o padrão de filtro pedido para este módulo.
 * Diferença: aqui não exige embalagem vinculada, só o Fator Hecto, que é
 * o que a conta de HL precisa. Na prática os 478 produtos ativos têm os
 * dois fatores, mas a condição fica explícita para o dia em que entrar um
 * SKU novo pela metade.
 */
export async function buscarProdutosAbastecimento(
  termo: string,
  filtros?: { cluster?: string; tipo?: string },
) {
  const revendaId = await getRevendaId();
  if (!revendaId) return [];

  const t = termo.trim();
  const temFiltro = Boolean(filtros?.cluster || filtros?.tipo);
  if (t.length < 2 && !temFiltro) return [];

  const supabase = await createClient();
  let consulta = supabase
    .from("pa_produtos")
    .select("id, codigo, descricao")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .not("fator_hecto", "is", null);

  if (filtros?.cluster) consulta = consulta.eq("cluster_produto", filtros.cluster);
  if (filtros?.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (t) consulta = consulta.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`);

  const { data } = await consulta.order("codigo").limit(50);
  return data ?? [];
}
