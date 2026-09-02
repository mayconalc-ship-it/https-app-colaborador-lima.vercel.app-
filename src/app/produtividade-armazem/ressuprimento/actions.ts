"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";
import { ehTurno } from "@/lib/produtividade-armazem";
import { calcularHl, ehUnidadeAbastecimento } from "@/lib/abastecimento";
import { ehPrioridade, ROTA_RESSUPRIMENTO } from "@/lib/ressuprimento";

const ROTA = ROTA_RESSUPRIMENTO;
const ROTA_ABASTECIMENTO = "/produtividade-armazem/abastecimento";

function erro(mensagem: string, aba = ""): never {
  const q = new URLSearchParams({ erro: mensagem });
  if (aba) q.set("aba", aba);
  redirect(`${ROTA}?${q}`);
}

function pronto(mensagem: string, aba = ""): never {
  const q = new URLSearchParams({ sucesso: mensagem });
  if (aba) q.set("aba", aba);
  redirect(`${ROTA}?${q}`);
}

/** Quem PEDE. */
const contextoSolicitante = () => exigirContextoModulo("pa-ressuprimento", ROTA);
/** Quem TRANSPORTA -- a concessão que os operadores de empilhadeira já têm. */
const contextoOperador = () => exigirContextoModulo("pa-empilhadeira", ROTA);
/** Quem ABASTECE -- a concessão de sempre do picking. */
const contextoAjudante = () => exigirContextoModulo("pa-picking", ROTA);

/**
 * Cria a solicitação INTEIRA de uma vez: cabeçalho e itens no mesmo
 * envio.
 *
 * Não existe rascunho de propósito. O desenho alternativo -- criar a
 * solicitação vazia e ir acrescentando item -- exigiria um carimbo de
 * "enviada" só para a fila da empilhadeira não mostrar pedidos pela
 * metade, e o operador acabaria buscando um palete enquanto a pessoa
 * ainda estava escolhendo o segundo. A lista é montada na tela e sobe
 * completa.
 *
 * O HL de cada item é calculado AQUI, no servidor, e gravado: se o fator
 * do produto mudar amanhã, o que já foi pedido continua valendo o que
 * valia (mesmo desenho do item de abastecimento).
 */
export async function criarSolicitacao(formData: FormData) {
  const { perfil, revendaId } = await contextoSolicitante();

  const turno = formData.get("turno");
  const prioridade = formData.get("prioridade");
  if (!ehTurno(turno)) erro("Escolha o turno.");
  if (!ehPrioridade(prioridade)) erro("Escolha a prioridade.");

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  // Os itens chegam como três listas paralelas (o formulário repete os
  // campos, um trio por item). Ler com getAll mantém a ordem em que a
  // pessoa montou a lista.
  const produtoIds = formData.getAll("item_produto_id").map(String);
  const unidades = formData.getAll("item_unidade").map(String);
  const quantidades = formData.getAll("item_quantidade").map(String);

  if (produtoIds.length === 0) erro("Adicione pelo menos um produto à solicitação.");
  if (produtoIds.length > 40) erro("Uma solicitação de cada vez, com até 40 itens.");
  if (unidades.length !== produtoIds.length || quantidades.length !== produtoIds.length) {
    erro("A lista de itens chegou incompleta. Monte a solicitação de novo.");
  }

  const supabase = await createClient();

  const { data: produtos } = await supabase
    .from("pa_produtos")
    .select("id, descricao, fator_hecto, caixas_pallet")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .in("id", produtoIds);

  const porId = new Map((produtos ?? []).map((p) => [p.id, p]));

  const itens: { produto_id: string; unidade: string; quantidade: number; hl_calculado: number }[] = [];

  for (let i = 0; i < produtoIds.length; i++) {
    const produto = porId.get(produtoIds[i]);
    if (!produto) erro("Um dos produtos não foi encontrado. Monte a solicitação de novo.");

    const unidade = unidades[i];
    if (!ehUnidadeAbastecimento(unidade)) erro("Escolha se cada item é caixa ou palete.");

    const quantidade = Number(quantidades[i].replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      erro(`Informe uma quantidade maior que zero para ${produto.descricao}.`);
    }
    if (quantidade > 100_000) erro("Quantidade fora do razoável -- confira o que digitou.");

    const hl = calcularHl(quantidade, unidade, {
      fatorHecto: produto.fator_hecto,
      caixasPallet: produto.caixas_pallet,
    });

    // Produto sem o fator é RECUSADO em vez de entrar valendo zero: um
    // item invisível no total é pior do que uma mensagem de erro.
    if (hl === null) {
      erro(
        unidade === "palete"
          ? `${produto.descricao} não tem "caixas por palete" no cadastro -- peça em caixa ou fale com o Admin.`
          : `${produto.descricao} não tem Fator Hecto no cadastro -- peça ao Admin para completar.`,
      );
    }

    itens.push({ produto_id: produto.id, unidade, quantidade, hl_calculado: hl });
  }

  const { data: criada, error } = await supabase
    .from("pa_ressuprimentos")
    .insert({
      revenda_id: revendaId,
      solicitante_id: perfil.id,
      solicitante_nome: perfil.nome,
      turno,
      prioridade,
      observacao,
    })
    .select("id")
    .maybeSingle();

  if (error || !criada) erro(`Não foi possível criar a solicitação: ${error?.message ?? "tente de novo"}`);

  const { error: erroItens } = await supabase
    .from("pa_ressuprimento_itens")
    .insert(itens.map((i) => ({ ...i, revenda_id: revendaId, ressuprimento_id: criada.id })));

  // Cabeçalho sem item nenhum é um pedido que a empilhadeira não consegue
  // atender e que ninguém consegue cancelar por não saber o que é. Some.
  if (erroItens) {
    await supabase.from("pa_ressuprimentos").delete().eq("id", criada.id);
    erro(`Não foi possível gravar os itens: ${erroItens.message}`);
  }

  revalidatePath(ROTA);
  pronto(`Solicitação enviada com ${itens.length} item(ns).`, "minhas");
}

/**
 * O operador ACEITA a solicitação: a partir daqui ela sai da fila e o
 * relógio do transporte começa.
 *
 * O `is null` no update é a trava contra dois operadores aceitarem o
 * mesmo pedido -- quem chegar em segundo não atualiza linha nenhuma e
 * recebe a mensagem. Checar antes e gravar depois deixaria a janela
 * aberta entre as duas consultas.
 */
export async function aceitarSolicitacao(formData: FormData) {
  const { perfil, revendaId } = await contextoOperador();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Solicitação inválida.", "fila");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_ressuprimentos")
    .update({
      operador_id: perfil.id,
      operador_nome: perfil.nome,
      transporte_inicio: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("transporte_inicio", null)
    .is("cancelado_em", null)
    .select("id");

  if (error) erro(`Não foi possível aceitar: ${error.message}`, "fila");
  if (!data || data.length === 0) {
    erro("Esta solicitação já foi aceita por outra pessoa, ou foi cancelada.", "fila");
  }

  revalidatePath(ROTA);
  pronto("Solicitação aceita. Marque cada item ao deixar na área.", "fila");
}

/**
 * Carimba UM item como entregue na área.
 *
 * Item a item porque a empilhadeira raramente leva tudo numa viagem, e
 * uma solicitação que só muda de estado quando o último item chega
 * esconde justamente a viagem que demorou.
 */
export async function entregarItem(formData: FormData) {
  const { perfil, revendaId } = await contextoOperador();

  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) erro("Item inválido.", "fila");

  const admin = createAdminClient();

  // Só o operador que aceitou carimba a entrega: sem isso, qualquer um
  // com a concessão inflaria o indicador de outro.
  const { data: item } = await admin
    .from("pa_ressuprimento_itens")
    .select("id, entregue_em, pa_ressuprimentos!inner(operador_id, cancelado_em)")
    .eq("id", itemId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const pedido = item?.pa_ressuprimentos as unknown as
    | { operador_id: string | null; cancelado_em: string | null }
    | undefined;

  if (!item || !pedido) erro("Item não encontrado.", "fila");
  if (pedido.cancelado_em) erro("Esta solicitação foi cancelada.", "fila");
  if (pedido.operador_id !== perfil.id) erro("Esta entrega é de outro operador.", "fila");
  if (item.entregue_em) erro("Este item já estava marcado como entregue.", "fila");

  const { error } = await admin
    .from("pa_ressuprimento_itens")
    .update({ entregue_em: new Date().toISOString(), entregue_por: perfil.id })
    .eq("id", itemId);

  if (error) erro(`Não foi possível marcar a entrega: ${error.message}`, "fila");

  revalidatePath(ROTA);
  pronto("Item entregue na área.", "fila");
}

/** Marca de uma vez os itens que ainda faltam -- a viagem única, que é o
 *  caso mais comum. Usa o mesmo carimbo para todos, porque foi um
 *  movimento só. */
export async function entregarTudo(formData: FormData) {
  const { perfil, revendaId } = await contextoOperador();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Solicitação inválida.", "fila");

  const admin = createAdminClient();
  const { data: pedido } = await admin
    .from("pa_ressuprimentos")
    .select("id, operador_id, cancelado_em")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!pedido) erro("Solicitação não encontrada.", "fila");
  if (pedido.cancelado_em) erro("Esta solicitação foi cancelada.", "fila");
  if (pedido.operador_id !== perfil.id) erro("Esta entrega é de outro operador.", "fila");

  const { error } = await admin
    .from("pa_ressuprimento_itens")
    .update({ entregue_em: new Date().toISOString(), entregue_por: perfil.id })
    .eq("ressuprimento_id", id)
    .is("entregue_em", null);

  if (error) erro(`Não foi possível marcar as entregas: ${error.message}`, "fila");

  revalidatePath(ROTA);
  pronto("Tudo entregue na área.", "fila");
}

/**
 * O ajudante começa a abastecer: abre a sessão de abastecimento de
 * sempre, vinculada à solicitação, já com os itens pedidos.
 *
 * Reusa `pa_abastecimentos` de propósito. Uma tabela nova em paralelo
 * faria o HL/h, o ranking e a meta do picking pararem de contar metade do
 * trabalho -- sem dar erro nenhum, que é o pior jeito de quebrar um
 * indicador.
 *
 * Os itens entram como PEDIDOS, e a tela de abastecimento permite tirar e
 * acrescentar antes de finalizar: o que foi abastecido nem sempre é o que
 * foi pedido, e é essa diferença que a gestão precisa enxergar.
 */
export async function iniciarAbastecimentoDaSolicitacao(formData: FormData) {
  const { perfil, revendaId } = await contextoAjudante();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Solicitação inválida.", "abastecer");

  const turno = formData.get("turno");
  if (!ehTurno(turno)) erro("Escolha o turno.", "abastecer");

  const admin = createAdminClient();

  const { data: pedido } = await admin
    .from("pa_ressuprimentos")
    .select("id, cancelado_em, pa_ressuprimento_itens(id, produto_id, unidade, quantidade, hl_calculado, entregue_em)")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!pedido) erro("Solicitação não encontrada.", "abastecer");
  if (pedido.cancelado_em) erro("Esta solicitação foi cancelada.", "abastecer");

  const itens = (pedido.pa_ressuprimento_itens ?? []) as {
    id: string;
    produto_id: string;
    unidade: string;
    quantidade: number;
    hl_calculado: number;
    entregue_em: string | null;
  }[];

  if (itens.length === 0 || itens.some((i) => !i.entregue_em)) {
    erro("Ainda falta item chegar na área. Espere a empilhadeira terminar a entrega.", "abastecer");
  }

  const supabase = await createClient();
  const { data: sessao, error } = await supabase
    .from("pa_abastecimentos")
    .insert({
      revenda_id: revendaId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      // Uma solicitação é sempre um chamado de itens específicos -- é a
      // definição de "pontual" no cadastro de tipos.
      tipo: "pontual",
      turno,
      inicio: new Date().toISOString(),
      status: "em_andamento",
      ressuprimento_id: id,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      erro(
        "Você já tem um abastecimento em andamento, ou esta solicitação já está sendo atendida. Finalize antes de começar outro.",
        "abastecer",
      );
    }
    erro(`Não foi possível começar: ${error.message}`, "abastecer");
  }

  const { error: erroItens } = await supabase.from("pa_abastecimento_itens").insert(
    itens.map((i) => ({
      revenda_id: revendaId,
      abastecimento_id: sessao!.id,
      produto_id: i.produto_id,
      unidade: i.unidade,
      quantidade: i.quantidade,
      hl_calculado: i.hl_calculado,
    })),
  );

  if (erroItens) {
    await supabase.from("pa_abastecimentos").delete().eq("id", sessao!.id);
    erro(`Não foi possível copiar os itens: ${erroItens.message}`, "abastecer");
  }

  revalidatePath(ROTA);
  revalidatePath(ROTA_ABASTECIMENTO);
  redirect(
    `${ROTA_ABASTECIMENTO}?sucesso=${encodeURIComponent(
      `Abastecimento iniciado com ${itens.length} item(ns) da solicitação. Ajuste o que for diferente e finalize.`,
    )}`,
  );
}

/**
 * Cancela a solicitação. Pode quem pediu (desistiu) e quem transporta
 * (não achou o produto no bloco) -- os dois descobrem o motivo antes de
 * ela virar trabalho de alguém.
 *
 * Não apaga: cancelamento é um fato, e uma solicitação que some não
 * aparece no indicador de quem pede demais e depois desiste.
 */
export async function cancelarSolicitacao(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  // Duas portas de entrada, e por isso a checagem é `temAcessoModulo`
  // (que RESPONDE) e não `exigirContextoModulo` (que REDIRECIONA):
  // redirect funciona lançando, então tentar o primeiro dentro de um
  // catch para cair no segundo engoliria o redirect e a pessoa ficaria
  // olhando para uma tela que não fez nada.
  const [pedeRessuprimento, operaEmpilhadeira] = await Promise.all([
    temAcessoModulo("pa-ressuprimento"),
    temAcessoModulo("pa-empilhadeira"),
  ]);
  if (!pedeRessuprimento && !operaEmpilhadeira) {
    erro("Você não tem acesso ao Ressuprimento do Picking.");
  }

  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 200) || null;
  if (!id) erro("Solicitação inválida.");
  if (!motivo) erro("Diga o motivo do cancelamento -- é o que evita o mesmo pedido voltar amanhã.");

  const admin = createAdminClient();

  const { data: pedido } = await admin
    .from("pa_ressuprimentos")
    .select("id, solicitante_id, operador_id, cancelado_em")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!pedido) erro("Solicitação não encontrada.");
  if (pedido.cancelado_em) erro("Esta solicitação já estava cancelada.");
  if (pedido.solicitante_id !== perfil.id && pedido.operador_id !== perfil.id) {
    erro("Só quem pediu ou quem está transportando pode cancelar.");
  }

  // Já virou abastecimento: o trabalho aconteceu, e cancelar aqui
  // deixaria uma sessão de abastecimento apontando para um pedido que
  // "nunca existiu".
  const { count } = await admin
    .from("pa_abastecimentos")
    .select("*", { count: "exact", head: true })
    .eq("ressuprimento_id", id);

  if (count) erro("Esta solicitação já foi para o abastecimento e não pode mais ser cancelada.");

  const { error } = await admin
    .from("pa_ressuprimentos")
    .update({
      cancelado_em: new Date().toISOString(),
      cancelado_por: perfil.id,
      motivo_cancelamento: motivo,
    })
    .eq("id", id);

  if (error) erro(`Não foi possível cancelar: ${error.message}`);

  revalidatePath(ROTA);
  pronto("Solicitação cancelada.");
}
