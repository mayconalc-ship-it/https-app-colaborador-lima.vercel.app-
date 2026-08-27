"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirContextoCarretas } from "@/lib/carretas-server";
import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { ehUnidadeItem, quantidadeNaoNegativa, quantidadePositiva } from "@/lib/carretas";

function rota(id: string) {
  return `/carretas-conferencia/${id}`;
}

function erro(id: string, mensagem: string): never {
  redirect(`${rota(id)}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Cadastro rápido de empilhador, direto do "+" no campo da Conferência
 * (pedido do dono, 27/08/2026) -- mesma ideia do criarMotoristaRapido em
 * carretas-portaria/actions.ts. Quem tem acesso de conferência OU de
 * descarga pode cadastrar -- o campo empilhador aparece pros dois lados
 * eventualmente precisarem indicar quem descarregou.
 */
export async function criarEmpilhadorRapido(
  formData: FormData,
): Promise<{ ok: true; valor: string; rotulo: string } | { ok: false; erro: string }> {
  const [podeConferencia, podeDescarga] = await Promise.all([
    temAcessoModulo("carretas-conferencia"),
    temAcessoModulo("carretas-descarga"),
  ]);
  if (!podeConferencia && !podeDescarga) {
    return { ok: false, erro: "Sem permissão para cadastrar empilhador." };
  }
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome do empilhador." };
  if (nome.split(/\s+/).filter(Boolean).length < 2) {
    return { ok: false, erro: "Informe o nome completo do empilhador." };
  }
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, erro: "Informe um CPF válido, com 11 dígitos." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_empilhadores")
    .insert({ revenda_id: revendaId, nome, cpf })
    .select("nome")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, erro: "Já existe um empilhador cadastrado com esse nome." };
    return { ok: false, erro: `Não foi possível cadastrar: ${error.message}` };
  }

  // Empilhador é texto livre no item da conferência -- grava o nome.
  return { ok: true, valor: data.nome, rotulo: data.nome };
}

/**
 * Descarga e conferência são fases independentes (desde a 063) -- o
 * empilhador descarrega, o conferente confere o que chegou, e uma pode
 * começar sem a outra ter começado. Este helper faz a transição de
 * status comum às quatro ações abaixo: sai de "aguardando_conferente"
 * assim que QUALQUER uma das duas fases começa, e vira
 * "aguardando_retorno" assim que as DUAS terminam (não importa a ordem).
 */
async function statusAposFase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  atendimentoId: string,
): Promise<"em_andamento" | "aguardando_retorno"> {
  const { data } = await supabase
    .from("atendimentos_carretas")
    .select("fim_descarga_em, fim_conferencia_em")
    .eq("id", atendimentoId)
    .maybeSingle();
  return data?.fim_descarga_em && data?.fim_conferencia_em ? "aguardando_retorno" : "em_andamento";
}

/** O empilhador clica ao começar a tirar as caixas do caminhão. */
export async function iniciarDescarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ inicio_descarga_em: new Date().toISOString(), status: "em_andamento" })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .is("inicio_descarga_em", null)
    .in("status", ["aguardando_conferente", "em_andamento"])
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível iniciar a descarga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A descarga já foi iniciada por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+iniciada`);
}

/** O empilhador clica ao terminar de tirar tudo do caminhão. */
export async function finalizarDescarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ fim_descarga_em: new Date().toISOString() })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .not("inicio_descarga_em", "is", null)
    .is("fim_descarga_em", null)
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível finalizar a descarga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A descarga já foi finalizada ou ainda não foi iniciada.");

  const novoStatus = await statusAposFase(supabase, atendimentoId);
  await supabase.from("atendimentos_carretas").update({ status: novoStatus }).eq("id", atendimentoId);

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+finalizada`);
}

/**
 * O conferente clica ao começar a contar o que chegou no chão -- vira a
 * pessoa responsável pelo atendimento (conferente_*), mas não mexe na
 * descarga: pode clicar antes, durante ou depois dela.
 */
export async function iniciarConferencia(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({
      inicio_conferencia_em: new Date().toISOString(),
      conferente_colaborador_id: perfil.id,
      conferente_nome: perfil.nome,
      status: "em_andamento",
    })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .is("inicio_conferencia_em", null)
    .in("status", ["aguardando_conferente", "em_andamento"])
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível iniciar a conferência: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A conferência já foi iniciada por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Conferência+iniciada`);
}

/**
 * O conferente salva os itens contados e encerra a conferência. Cada
 * item grava quantidade RECEBIDA e quantidade AVARIADA (novo desde a
 * 063 -- antes só existia "quantidade"), pra dar o % de avaria do
 * atendimento na tela de finalizado.
 */
export async function finalizarConferencia(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const produtoIds = formData.getAll("produto_id").map(String);
  const quantidades = formData.getAll("quantidade").map(String);
  const quantidadesAvariadas = formData.getAll("quantidade_avariada").map(String);
  const unidades = formData.getAll("unidade").map(String);
  const lotes = formData.getAll("lote").map(String);
  const validades = formData.getAll("validade").map(String);
  const empilhadores = formData.getAll("empilhador").map(String);

  if (produtoIds.length === 0 || produtoIds.some((id) => !id)) {
    erro(atendimentoId, "Adicione ao menos um item com o produto escolhido.");
  }

  const itens = produtoIds.map((produtoId, i) => {
    let quantidade: number;
    let quantidadeAvariada: number;
    try {
      quantidade = quantidadePositiva(quantidades[i]);
      quantidadeAvariada = quantidadeNaoNegativa(quantidadesAvariadas[i] || "0");
    } catch (e) {
      erro(atendimentoId, e instanceof Error ? e.message : "Quantidade inválida em um dos itens.");
    }
    if (quantidadeAvariada > quantidade) {
      erro(atendimentoId, "A quantidade avariada não pode ser maior que a recebida.");
    }
    const unidade = unidades[i];
    if (!ehUnidadeItem(unidade)) erro(atendimentoId, "Escolha a unidade (palete/caixa) de cada item.");
    const lote = (lotes[i] ?? "").trim();
    const validade = (validades[i] ?? "").trim();
    const empilhador = (empilhadores[i] ?? "").trim();
    if (!lote) erro(atendimentoId, "Informe o lote de cada item.");
    if (!validade) erro(atendimentoId, "Informe a validade de cada item.");
    if (!empilhador) erro(atendimentoId, "Informe o empilhador de cada item.");
    return { produtoId, quantidade, quantidadeAvariada, unidade, lote, validade, empilhador };
  });

  const supabase = await createClient();

  const { error: erroItens } = await supabase.from("atendimento_carretas_itens").insert(
    itens.map((i) => ({
      revenda_id: revendaId,
      atendimento_id: atendimentoId,
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      quantidade_avariada: i.quantidadeAvariada,
      unidade: i.unidade,
      lote: i.lote,
      validade: i.validade,
      empilhador: i.empilhador,
    })),
  );
  if (erroItens) erro(atendimentoId, `Não foi possível salvar os itens: ${erroItens.message}`);

  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ fim_conferencia_em: new Date().toISOString() })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .not("inicio_conferencia_em", "is", null)
    .is("fim_conferencia_em", null)
    .select("id");

  if (error) erro(atendimentoId, `Itens salvos, mas não foi possível finalizar a conferência: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A conferência já foi finalizada ou ainda não foi iniciada.");

  const novoStatus = await statusAposFase(supabase, atendimentoId);
  await supabase.from("atendimentos_carretas").update({ status: novoStatus }).eq("id", atendimentoId);

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Conferência+finalizada`);
}

/**
 * "Retorno vazio" (sem AG) finaliza direto. "Retorno com AG" grava
 * destino + itens de AG e abre a fase de carga. Só aparece quando
 * descarga E conferência já terminaram (status = aguardando_retorno).
 * `retorno_decidido_em` fecha o TMA (ver calcularTmaMinutos).
 */
export async function decidirRetorno(formData: FormData) {
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
        ? { retorno_decidido_em: agora, tem_carga: true, inicio_carga_em: agora, status: "em_carga", destino_retorno: destinoRetorno }
        : { retorno_decidido_em: agora, tem_carga: false, finalizacao_em: agora, status: "finalizado" },
    )
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("status", "aguardando_retorno")
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível confirmar o retorno: ${error.message}`);
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
    if (erroAg) erro(atendimentoId, `Retorno confirmado, mas os itens de AG falharam: ${erroAg.message}`);
  }

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Retorno+confirmado`);
}

export async function concluirCarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");

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
