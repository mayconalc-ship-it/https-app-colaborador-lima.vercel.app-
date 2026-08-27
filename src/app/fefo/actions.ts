"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { temAcessoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  TIPO_QUEBRA_FEFO,
  ehDepositoFefo,
  ehRuaFefo,
  ehTipoQuebraFefo,
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
  const tipo = formData.get("tipo");
  const deposito = String(formData.get("deposito") ?? "").toUpperCase();
  const ruaBruta = String(formData.get("rua") ?? "");
  const validade = String(formData.get("validade") ?? "").trim();
  const menorValidade = String(formData.get("menor_validade") ?? "").trim();
  const ponto = String(formData.get("ponto") ?? "").trim().slice(0, 120) || null;
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  const ruaBloqueada = formData.get("rua_bloqueada") === "on";

  if (!produtoId) erro("Escolha o produto.");
  if (!ehTipoQuebraFefo(tipo)) erro("Escolha o tipo da quebra de FEFO.");
  if (!ehDepositoFefo(deposito)) erro("Escolha o depósito (A, B ou C).");
  if (!ehRuaFefo(ruaBruta)) erro("Escolha a rua (de 1 a 10).");
  if (!validade) erro("Informe a validade do palete encontrado.");
  if (!menorValidade) erro("Informe a menor validade que existe no estoque.");

  // A menor data não pode ser MAIOR que a do palete achado -- se fosse,
  // não haveria data menor sendo pulada. O banco também segura isso
  // (constraint pa_fefo_datas_coerentes), aqui é só pra mensagem boa.
  if (menorValidade > validade) {
    erro("A menor validade do estoque não pode ser maior que a validade do palete encontrado.");
  }

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
  const { data: criada, error } = await supabase
    .from("pa_fefo_ocorrencias")
    .insert({
      revenda_id: revendaId,
      produto_id: produtoId,
      tipo,
      quantidade,
      validade,
      menor_validade: menorValidade,
      deposito,
      rua: Number(ruaBruta),
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
    const titulo = `🚨 Quebra de FEFO — Depósito ${deposito}, rua ${ruaBruta}`;
    const mensagem = `${TIPO_QUEBRA_FEFO[tipo].rotulo}. ${nomeProduto}, ${quantidade} un. ${prazo.texto}. Informado por ${perfil.nome}.`;

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
  const { data: atualizada, error } = await admin
    .from("pa_fefo_ocorrencias")
    .update({
      status: "tratada",
      acao,
      tratado_por_id: perfil.id,
      tratado_por_nome: perfil.nome,
      tratado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("status", "aberta")
    .select("id");

  if (error) erro(`Não foi possível salvar: ${error.message}`);
  if (!atualizada || atualizada.length === 0) erro("Esta ocorrência já foi tratada por outra pessoa.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=controle&sucesso=${encodeURIComponent("Ação registrada.")}`);
}
