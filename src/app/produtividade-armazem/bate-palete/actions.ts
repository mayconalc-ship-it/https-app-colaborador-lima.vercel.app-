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
import { hlDaAvaria, hlDePaletes, ehUnidadeBatePalete } from "@/lib/bate-palete";

const ROTA = "/produtividade-armazem/bate-palete";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo("pa-bate-palete", ROTA);

/**
 * Abre a sessão: grava o início AGORA, no servidor -- não no relógio do
 * celular, que cada um acerta como quer. `fim` nulo é o que marca a
 * sessão em andamento.
 *
 * A trava contra duas sessões abertas ao mesmo tempo é o índice único
 * parcial (migration 087); aqui só traduzimos a violação em português.
 */
export async function iniciarBatePalete(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const turno = formData.get("turno");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();
  const { error } = await supabase.from("pa_bate_palete").insert({
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    turno,
    inicio: new Date().toISOString(),
    status: "em_andamento",
  });

  if (error) {
    if (error.code === "23505") {
      erro("Você já tem um bate palete em andamento. Finalize antes de iniciar outro.");
    }
    erro(`Não foi possível iniciar: ${error.message}`);
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Bate palete iniciado")}`);
}

/**
 * Registra UM lote batido: quantos paletes, e quanto saiu avariado.
 *
 * AS DUAS QUANTIDADES TÊM UNIDADES DIFERENTES, e é assim que a operação
 * conta (pedido do dono, 03/09/2026): bate-se PALETE, e a avaria que sai
 * dele são algumas CAIXAS ou garrafas soltas. Ninguém avaria um palete
 * inteiro, e ninguém bate meia caixa.
 *
 * O HL é o que torna as duas comparáveis, e é dele que sai o percentual
 * de avaria por palete batido. Ele é calculado AQUI, no servidor, a
 * partir do cadastro, e GRAVADO: se o fator do produto mudar amanhã, o
 * que já foi batido continua valendo o que valia (mesmo desenho do litro
 * do reepack).
 */
export async function registrarPalete(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const sessaoId = String(formData.get("bate_palete_id") ?? "");
  const produtoId = String(formData.get("produto_id") ?? "");
  if (!sessaoId) erro("Sessão inválida.");
  if (!produtoId) erro("Escolha o produto.");

  const unidade = formData.get("unidade_avariada");
  if (!ehUnidadeBatePalete(unidade)) erro("Escolha se a avaria é em caixa ou em unidade.");

  const paletes = Number(String(formData.get("paletes") ?? "").replace(",", "."));
  const avariada = Number(String(formData.get("quantidade_avariada") ?? "").replace(",", "."));

  if (!Number.isFinite(paletes) || paletes <= 0) {
    erro("Informe quantos paletes foram batidos (pode ter vírgula: meio palete é 0,5).");
  }
  if (paletes > 500) erro("Quantidade de paletes fora do razoável -- confira o que digitou.");

  if (!Number.isFinite(avariada) || avariada < 0) {
    erro("Informe a quantidade avariada (número, pode ter vírgula).");
  }
  if (avariada > 100_000) erro("Quantidade avariada fora do razoável -- confira o que digitou.");

  // A comparação "a avaria cabe no lote" NÃO é feita aqui em quantidade:
  // 3 caixas avariadas num palete é normal, e comparar 3 com 1 recusaria
  // o lançamento certo. Ela é feita mais abaixo, em HL, que é a unidade
  // comum das duas medidas.

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 200) || null;

  const supabase = await createClient();

  // A sessão precisa estar aberta E ser da própria pessoa: sem isso, um
  // id copiado da URL deixaria lançar na sessão de outro.
  const { data: sessao } = await supabase
    .from("pa_bate_palete")
    .select("id")
    .eq("id", sessaoId)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null)
    .maybeSingle();

  if (!sessao) erro("Este bate palete já foi finalizado ou não é seu.");

  const { data: produto } = await supabase
    .from("pa_produtos")
    .select("id, descricao, fator_hecto, unidades_por_caixa, caixas_pallet")
    .eq("id", produtoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();

  if (!produto) erro("Produto não encontrado.");

  const fatores = {
    fatorHecto: produto.fator_hecto,
    unidadesPorCaixa: produto.unidades_por_caixa,
    caixasPallet: produto.caixas_pallet,
  };

  const hlBatido = hlDePaletes(paletes, fatores);
  const hlAvariado = hlDaAvaria(avariada, unidade, fatores);

  // Produto sem o fator é RECUSADO em vez de entrar valendo zero: um
  // item invisível no total é pior do que uma mensagem de erro. Cada
  // fator que falta gera a frase que diz qual é -- "faltou cadastro" sem
  // dizer o quê manda a pessoa adivinhar.
  if (hlBatido === null) {
    erro(
      produto.caixas_pallet === null || !(produto.caixas_pallet > 0)
        ? `${produto.descricao} não tem "caixas por palete" no cadastro -- peça ao Admin para completar em Configuração.`
        : `${produto.descricao} não tem Fator Hecto no cadastro -- peça ao Admin para completar em Configuração.`,
    );
  }
  if (hlAvariado === null) {
    erro(
      unidade === "unidade"
        ? `${produto.descricao} não tem "unidades por caixa" no cadastro -- conte a avaria em caixa ou peça ao Admin para completar.`
        : `${produto.descricao} não tem Fator Hecto no cadastro -- peça ao Admin para completar em Configuração.`,
    );
  }

  // Agora sim, em HL: a avaria faz parte do lote batido. Sem esta trava
  // daria para lançar 1 palete com 500 caixas avariadas, e o percentual
  // passaria de 100% sem ninguém entender de onde veio. O banco também
  // recusa (constraint), mas o erro dele não é uma frase que a operação
  // entenda.
  if (hlAvariado > hlBatido) {
    erro(
      `A avaria informada (${hlAvariado} HL) é maior que o lote batido (${hlBatido} HL) -- ela faz parte do lote. Confira a quantidade ou a unidade.`,
    );
  }

  const { error } = await supabase.from("pa_bate_palete_itens").insert({
    revenda_id: revendaId,
    bate_palete_id: sessaoId,
    produto_id: produto.id,
    paletes,
    unidade_avariada: unidade,
    quantidade_avariada: avariada,
    hl_batido: hlBatido,
    hl_avariado: hlAvariado,
    observacao,
  });

  if (error) erro(`Não foi possível registrar o lote: ${error.message}`);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?sucesso=${encodeURIComponent(
      `${produto.descricao} — ${paletes} palete(s), ${avariada} avariada(s)`,
    )}`,
  );
}

/** Tira um lote lançado errado, enquanto a sessão ainda está aberta. */
export async function removerPalete(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Lote inválido.");

  const supabase = await createClient();

  // O RLS já barra item de sessão alheia, mas a checagem de sessão ABERTA
  // é regra de negócio, não de acesso: item de sessão fechada virou
  // estatística, e apagar isso é exclusão de lançamento, não correção.
  const { data: item } = await supabase
    .from("pa_bate_palete_itens")
    .select("id, pa_bate_palete!inner(colaborador_id, fim)")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const sessao = item?.pa_bate_palete as unknown as
    | { colaborador_id: string; fim: string | null }
    | undefined;

  if (!item || !sessao || sessao.colaborador_id !== perfil.id || sessao.fim !== null) {
    erro("Só dá para remover lote de um bate palete seu que ainda está aberto.");
  }

  await supabase.from("pa_bate_palete_itens").delete().eq("id", id);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Lote+removido`);
}

/**
 * Fecha a sessão. Os totais (lotes, HL, % de avaria, taxas) NÃO são
 * gravados -- saem dos itens na leitura, porque um total gravado que
 * discorde dos itens é pior do que total nenhum. Ver resumirBatePalete.
 */
export async function finalizarBatePalete(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();

  // Sem palete, a sessão não mede nada: o tempo existiria sem produção
  // nenhuma e entraria no indicador como produtividade zero.
  const { count } = await supabase
    .from("pa_bate_palete_itens")
    .select("*", { count: "exact", head: true })
    .eq("bate_palete_id", id);

  if (!count) erro("Registre pelo menos um lote antes de finalizar.");

  const { error } = await supabase
    .from("pa_bate_palete")
    .update({ fim: new Date().toISOString(), status: "concluido", observacao })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  if (error) erro(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Bate+palete+finalizado`);
}

/** Desiste de uma sessão aberta por engano -- some sem virar estatística.
 *  Os itens vão junto pelo cascade da FK. */
export async function cancelarBatePalete(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();
  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const supabase = await createClient();
  await supabase
    .from("pa_bate_palete")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Bate+palete+cancelado`);
}

/** Exclui uma sessão já finalizada. Quem lançou apaga a própria; a
 *  liderança com "excluir" apaga qualquer uma -- mesma regra do reepack
 *  e do abastecimento. */
export async function excluirBatePalete(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Sessão inválida.");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const gestor = await podeNoModulo("produtividade-armazem", "excluir");
  if (gestor) {
    const admin = createAdminClient();
    await admin.from("pa_bate_palete").delete().eq("id", id).eq("revenda_id", revendaId);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pa_bate_palete")
      .delete()
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id);
    if (error) erro("Você só pode excluir os próprios lançamentos.");
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=historico&sucesso=Bate+palete+excluído`);
}

/**
 * Busca de produto do combobox -- MESMO formato do Reepack (Cluster →
 * Tipo → digitar). Exige o Fator Hecto, que é o que a conta de HL
 * recuperado precisa.
 */
export async function buscarProdutosBatePalete(
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
