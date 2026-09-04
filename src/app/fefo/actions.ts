"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { temAcessoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { calcularHl as calcularHlProduto } from "@/lib/unidades-produto";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  ROTULO_UNIDADE_FEFO_CURTO,
  ehUnidadeFefo,
  rotuloValidade,
} from "@/lib/fefo";

const ROTA = "/fefo";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Busca de produto para o FEFO. Mesma navegação Cluster -> Tipo ->
 * Produto do Reepack, mas sobre a base INTEIRA: a quebra acontece com
 * qualquer SKU no estoque, não só com os que estão prontos para
 * reembalar (que é o recorte do buscarProdutosReepack).
 */
export async function buscarProdutosFefo(
  termo: string,
  filtros?: { cluster?: string; tipo?: string },
) {
  // Devolve lista vazia em vez de redirecionar: é chamada do componente
  // cliente a cada tecla, e um redirect no meio da digitação seria pior
  // que não achar nada.
  if (!(await temAcessoModulo("fefo"))) return [];
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
    .eq("ativo", true);

  if (filtros?.cluster) consulta = consulta.eq("cluster_produto", filtros.cluster);
  if (filtros?.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (t) consulta = consulta.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`);

  const { data } = await consulta.order("codigo").limit(50);
  return data ?? [];
}

/** Quem encontrou a quebra avisa. O controle recebe na hora. */
export async function registrarQuebraFefo(formData: FormData) {
  const perfil = await requireAcessoModulo("fefo", "/produtividade-armazem");
  const revendaId = await exigirRevenda(ROTA);

  const produtoId = String(formData.get("produto_id") ?? "");
  const motivoId = String(formData.get("motivo_id") ?? "");
  // Vêm os IDs do cadastro (migration 097), e o NOME é resolvido aqui --
  // não aceito o nome que o formulário mandar. Assim o que fica gravado é
  // sempre um lugar que existe no cadastro, e a validação não precisa de
  // uma lista fixa no código.
  const depositoId = String(formData.get("deposito_id") ?? "");
  const ruaId = String(formData.get("rua_id") ?? "");
  const validade = String(formData.get("validade") ?? "").trim();
  const menorValidade = String(formData.get("menor_validade") ?? "").trim();
  const ponto = String(formData.get("ponto") ?? "").trim().slice(0, 120) || null;
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  const ruaBloqueada = formData.get("rua_bloqueada") === "on";

  if (!produtoId) erro("Escolha o produto.");
  if (!motivoId) erro("Escolha o motivo da quebra de FEFO.");
  if (!depositoId) erro("Escolha o depósito.");
  if (!ruaId) erro("Escolha a rua.");
  if (!validade) erro("Informe a validade do palete encontrado.");

  // Menor validade é OPCIONAL: quem acha a quebra no corredor nem sempre
  // sabe a menor data do estoque inteiro, e exigir isso faria a pessoa
  // desistir de avisar. Quando vier, ainda tem que ser coerente.
  if (menorValidade && menorValidade > validade) {
    erro("A menor validade do estoque não pode ser maior que a validade do palete encontrado.");
  }

  const unidade = String(formData.get("unidade") ?? "");
  if (!ehUnidadeFefo(unidade)) erro("Escolha a unidade: palete, lastro, caixa ou unidade.");

  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) erro("Informe a quantidade encontrada.");

  // Foto é opcional: a quebra tem que ser fácil de avisar. Quem tirar,
  // some junto -- reaproveita o upload com compressão do armazém.
  let fotoUrl: string | null = null;
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const enviada = await subirFotoHorimetro(foto, perfil.id, "fefo");
    if (!enviada.ok) erro(enviada.erro);
    fotoUrl = enviada.url;
  }

  const supabase = await createClient();

  // O motivo tem que ser da PRÓPRIA revenda e estar ativo -- senão daria
  // para mandar o id de um motivo de outra revenda no formulário.
  const { data: motivo } = await supabase
    .from("pa_fefo_motivos")
    .select("id, nome")
    .eq("id", motivoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!motivo) erro("Motivo inválido ou desativado. Escolha outro.");

  // O mesmo cuidado para o lugar: depósito e rua da PRÓPRIA revenda,
  // ativos, e a rua tem de ser DAQUELE depósito -- senão daria para
  // gravar "depósito A, rua 7" com a rua 7 do C.
  const { data: deposito } = await supabase
    .from("pa_fefo_depositos")
    .select("id, nome")
    .eq("id", depositoId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!deposito) erro("Depósito inválido ou desativado. Escolha outro.");

  const { data: rua } = await supabase
    .from("pa_fefo_ruas")
    .select("id, nome")
    .eq("id", ruaId)
    .eq("deposito_id", deposito.id)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!rua) erro("Rua inválida para este depósito. Escolha outra.");

  /*
    O HL DA QUEBRA, calculado aqui e GRAVADO (pedido do dono,
    04/09/2026: as unidades refletindo no cálculo de HL).

    Antes o FEFO registrava quantidade e unidade e parava ali. Com quatro
    unidades no mesmo campo, "12" de um produto e "12" de outro deixam de
    ser comparáveis sem converter -- e somar quebras por produto, que é
    o que o painel faz, exigiria converter na leitura, toda vez, com o
    fator de hoje.

    Gravado na hora pelo mesmo motivo do Abastecimento e do Reepack: se o
    fator do produto mudar amanhã, a quebra de ontem continua valendo o
    que valia.

    DIFERENÇA IMPORTANTE em relação ao Abastecimento: aqui o HL nulo NÃO
    recusa o lançamento. Uma quebra de FEFO é um problema achado no
    pátio, e a pessoa está com o palete na frente -- barrar o registro
    porque falta um fator no cadastro perderia a informação que importa
    (que houve quebra) por causa de um número secundário. O HL fica nulo
    e o Admin completa o cadastro depois.
  */
  const { data: produtoFatores } = await supabase
    .from("pa_produtos")
    .select("fator_hecto, caixas_pallet, caixas_por_lastro, unidades_por_caixa")
    .eq("id", produtoId)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const hlCalculado = produtoFatores
    ? calcularHlProduto(quantidade, unidade, {
        fatorHecto: produtoFatores.fator_hecto,
        caixasPallet: produtoFatores.caixas_pallet,
        caixasPorLastro: produtoFatores.caixas_por_lastro,
        unidadesPorCaixa: produtoFatores.unidades_por_caixa,
      })
    : null;

  const { data: criada, error } = await supabase
    .from("pa_fefo_ocorrencias")
    .insert({
      revenda_id: revendaId,
      produto_id: produtoId,
      motivo_id: motivo.id,
      quantidade,
      unidade,
      hl_calculado: hlCalculado,
      validade,
      menor_validade: menorValidade || null,
      // O NOME, não o id: o endereço de um fato passado não muda quando
      // alguém renomeia a rua hoje (ver migration 097).
      deposito: deposito.nome,
      rua: rua.nome,
      ponto,
      rua_bloqueada: ruaBloqueada,
      foto_url: fotoUrl,
      observacao,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
    })
    .select("id, produto_id")
    .single();

  if (error) erro(`Não foi possível registrar: ${error.message}`);

  // Aviso ao controle. Uma quebra parada numa lista que ninguém abre não
  // evita a perda do produto -- por isso o push sai junto do registro.
  // Nunca derruba o registro: se o aviso falhar, a ocorrência já existe.
  try {
    const admin = createAdminClient();
    const { data: produto } = await admin
      .from("pa_produtos")
      .select("codigo, descricao")
      .eq("id", produtoId)
      .maybeSingle();

    const nomeProduto = produto ? `${produto.codigo} — ${produto.descricao}` : "produto";
    const prazo = rotuloValidade(validade);
    const titulo = `🚨 Quebra de FEFO — Depósito ${deposito.nome}, rua ${rua.nome}`;
    const mensagem = `${motivo.nome}. ${nomeProduto}, ${quantidade} ${ROTULO_UNIDADE_FEFO_CURTO[unidade]}. ${prazo.texto}. Informado por ${perfil.nome}.`;

    await criarNotificacao({
      modulo: "produtividade-armazem",
      tipo: "pendencia",
      titulo,
      mensagem,
      url: `${ROTA}?aba=controle`,
      referenciaId: criada.id,
      criadoPor: perfil.nome,
    });
    await enviarPushDaRevenda(revendaId, {
      modulo: "produtividade-armazem",
      titulo,
      mensagem,
      url: `${ROTA}?aba=controle`,
      exceto: perfil.id,
    });
  } catch {
    // Aviso é acessório; o registro é o que não pode se perder.
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=${encodeURIComponent("Quebra de FEFO informada. O controle foi avisado.")}`);
}

/**
 * O controle responde o que foi feito. Usa service role de propósito: a
 * linha é de outra pessoa, e a RLS (migration 066) só deixa o dono
 * inserir -- nem o próprio autor edita depois de enviar. Quem pode
 * fechar é quem tem "fefo-controle", conferido aqui.
 */
export async function tratarQuebraFefo(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  if (!(await temAcessoModulo("fefo-controle"))) {
    erro("Só o controle de estoque pode responder a ação tomada.");
  }
  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");

  const id = String(formData.get("id") ?? "");
  const acao = String(formData.get("acao") ?? "").trim().slice(0, 500);
  if (!id) erro("Ocorrência inválida.");
  if (!acao) erro("Descreva a ação tomada.");

  const admin = createAdminClient();

  // Quem informou pode não saber a menor data do estoque -- o controle
  // completa aqui. Só PREENCHE o que está em branco: sobrescrever o que
  // o colaborador informou mudaria o registro dele sem deixar rastro.
  const menorValidade = String(formData.get("menor_validade") ?? "").trim();
  const dados: Record<string, unknown> = {
    status: "tratada",
    acao,
    tratado_por_id: perfil.id,
    tratado_por_nome: perfil.nome,
    tratado_em: new Date().toISOString(),
  };

  if (menorValidade) {
    const { data: atual } = await admin
      .from("pa_fefo_ocorrencias")
      .select("validade, menor_validade")
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    if (!atual) erro("Ocorrência não encontrada.");
    if (atual.menor_validade) {
      erro("Esta ocorrência já tem a menor validade informada.");
    }
    if (menorValidade > atual.validade) {
      erro("A menor validade do estoque não pode ser maior que a validade do palete encontrado.");
    }
    dados.menor_validade = menorValidade;
  }

  const { data: atualizada, error } = await admin
    .from("pa_fefo_ocorrencias")
    .update(dados)
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("status", "aberta")
    .select("id");

  if (error) erro(`Não foi possível salvar: ${error.message}`);
  if (!atualizada || atualizada.length === 0) erro("Esta ocorrência já foi tratada por outra pessoa.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=controle&sucesso=${encodeURIComponent("Ação registrada.")}`);
}
