"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo, temAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaId } from "@/lib/revendas";
import { subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { ehTurno, hojeISO } from "@/lib/produtividade-armazem";
import { calcularHl } from "@/lib/unidades-produto";
import { SEM_COLABORADOR_WQI, ehUnidadeWqi, unidadesEquivalentes } from "@/lib/wqi";
import { noLugar, pararComErro, pararComSucesso, type ResultadoAcao } from "@/lib/resultado-acao";

const ROTA = "/wqi";

function erro(mensagem: string): never {
  pararComErro(mensagem);
}

/** A base INTEIRA de produtos: quebra acontece com qualquer SKU. */
export async function buscarProdutosWqi(termo: string, filtros?: { cluster?: string; tipo?: string }) {
  // Lista vazia em vez de redirect: é chamada a cada tecla.
  if (!(await temAcessoModulo("wqi"))) return [];
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

/** Quem manuseava: pessoas da revenda, por nome ou CPF. */
export async function buscarResponsaveisWqi(termo: string) {
  if (!(await temAcessoModulo("wqi"))) return [];
  const revendaId = await getRevendaId();
  if (!revendaId || termo.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const ids = (vinculos ?? []).map((v) => v.colaborador_id);
  if (ids.length === 0) return [];

  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  let consulta = admin.from("profiles").select("id, nome, cargo").in("id", ids).limit(10);
  consulta = digitos ? consulta.or(`nome.ilike.%${t}%,cpf.ilike.%${digitos}%`) : consulta.ilike("nome", `%${t}%`);
  const { data } = await consulta;
  return data ?? [];
}

export async function registrarBaixaWqi(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const perfil = await requireAcessoModulo("wqi", "/produtividade-armazem");
    const revendaId = await exigirRevenda(ROTA);

    const produtoId = String(formData.get("produto_id") ?? "");
    const motivoId = String(formData.get("motivo_id") ?? "");
    const localId = String(formData.get("local_id") ?? "");
    const turno = formData.get("turno");
    const unidade = String(formData.get("unidade") ?? "");
    const quantidade = Number(formData.get("quantidade"));
    const dataOcorrido = String(formData.get("data_ocorrido") ?? "").trim();
    const notaFiscal = String(formData.get("nota_fiscal") ?? "").trim().slice(0, 40) || null;
    const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
    const responsavelId = String(formData.get("responsavel_id") ?? "") || null;
    const semColaborador = formData.get("sem_colaborador") === "1";

    // O COLABORADOR É OBRIGATÓRIO (06/10/2026, pedido do dono): uma pessoa
    // da revenda, ou "não tem colaborador" marcado de propósito. Em branco
    // não passa mais.
    if (!responsavelId && !semColaborador) {
      erro('Informe o colaborador — ou marque "Não tem colaborador".');
    }
    if (responsavelId && semColaborador) {
      erro('Escolha um colaborador OU marque "Não tem colaborador" — não os dois.');
    }
    if (!produtoId) erro("Escolha o produto.");
    if (!Number.isInteger(quantidade) || quantidade <= 0) erro("Informe a quantidade quebrada.");
    if (!ehUnidadeWqi(unidade)) erro("Escolha a unidade.");
    if (!motivoId) erro("Escolha o motivo.");
    if (!localId) erro("Escolha o local.");
    if (!ehTurno(turno)) erro("Escolha o turno.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataOcorrido)) erro("Informe a data do ocorrido.");
    if (dataOcorrido > hojeISO()) erro("A data do ocorrido não pode ser no futuro.");

    const supabase = await createClient();
    const admin = createAdminClient();

    // Tudo da PRÓPRIA revenda e ativo -- senão daria para mandar o id de
    // outra revenda no formulário. O nome é resolvido aqui, não aceito do
    // navegador.
    const [{ data: produto }, { data: motivo }, { data: local }] = await Promise.all([
      supabase
        .from("pa_produtos")
        .select("id, codigo, descricao, fator_hecto, caixas_pallet, caixas_por_lastro, unidades_por_caixa")
        .eq("id", produtoId)
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      supabase.from("pa_wqi_motivos").select("nome").eq("id", motivoId).eq("revenda_id", revendaId).eq("ativo", true).maybeSingle(),
      supabase.from("pa_wqi_locais").select("nome").eq("id", localId).eq("revenda_id", revendaId).eq("ativo", true).maybeSingle(),
    ]);
    if (!produto) erro("Produto inválido. Escolha pela busca.");
    if (!motivo) erro("Motivo inválido ou desativado.");
    if (!local) erro("Local inválido ou desativado.");

    // O responsável tem de ser da revenda. Nome e cargo vão gravados: a
    // baixa diz quem era e em que função estava NO DIA.
    let responsavel: { id: string; nome: string; cargo: string | null } | null = null;
    if (responsavelId) {
      const { data: vinculo } = await admin
        .from("colaborador_revendas")
        .select("colaborador_id")
        .eq("colaborador_id", responsavelId)
        .eq("revenda_id", revendaId)
        .maybeSingle();
      if (!vinculo) erro("O colaborador escolhido não é desta revenda.");
      const { data: p } = await admin.from("profiles").select("id, nome, cargo").eq("id", responsavelId).maybeSingle();
      if (!p) erro("Colaborador não encontrado.");
      responsavel = p;
    }

    // Foto opcional, com a mesma compressão do armazém.
    let fotoUrl: string | null = null;
    const foto = formData.get("foto");
    if (foto instanceof File && foto.size > 0) {
      const enviada = await subirFotoHorimetro(foto, perfil.id, "wqi");
      if (!enviada.ok) erro(enviada.erro);
      fotoUrl = enviada.url;
    }

    const fatores = {
      fatorHecto: produto.fator_hecto,
      caixasPallet: produto.caixas_pallet,
      caixasPorLastro: produto.caixas_por_lastro,
      unidadesPorCaixa: produto.unidades_por_caixa,
    };

    // HL e unidades NULOS não recusam a baixa: a quebra já aconteceu, e
    // perder o registro por um fator faltando no cadastro seria pior.
    const { error } = await supabase.from("pa_wqi_baixas").insert({
      revenda_id: revendaId,
      data_ocorrido: dataOcorrido,
      turno,
      produto_id: produto.id,
      produto_codigo: produto.codigo,
      produto_descricao: produto.descricao,
      quantidade,
      unidade,
      unidades_equivalentes: unidadesEquivalentes(quantidade, unidade, fatores),
      hl_calculado: calcularHl(quantidade, unidade, fatores),
      motivo: motivo.nome,
      local: local.nome,
      nota_fiscal: notaFiscal,
      responsavel_id: responsavel?.id ?? null,
      responsavel_nome: semColaborador ? SEM_COLABORADOR_WQI : (responsavel?.nome ?? null),
      responsavel_funcao: responsavel?.cargo ?? null,
      foto_url: fotoUrl,
      observacao,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      origem: "app",
    });
    if (error) erro(`Não foi possível registrar: ${error.message}`);

    revalidatePath(ROTA);
    revalidatePath("/gestao/wqi");
    pararComSucesso("Baixa WQI registrada.");
  });
}

/**
 * Apagar lançamento errado. Só liderança com "wqi:excluir": a baixa é
 * dado de perda, e sumir com ela não é a mesma permissão que lançar.
 * Service role porque a RLS não tem política de delete.
 */
export async function excluirBaixaWqi(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {

    if (!(await podeNoModulo("wqi", "excluir"))) {
      pararComErro("Você não tem permissão para excluir baixas WQI.");
    }
    const revendaId = await getRevendaId();
    const id = String(formData.get("id") ?? "");
    if (!revendaId || !id) pararComErro("Baixa não encontrada.");

    const admin = createAdminClient();
    const { error } = await admin.from("pa_wqi_baixas").delete().eq("id", id).eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível excluir: ${error.message}`);

    revalidatePath("/gestao/wqi");
    revalidatePath(ROTA);
    pararComSucesso("Baixa excluída.");
  });
}
