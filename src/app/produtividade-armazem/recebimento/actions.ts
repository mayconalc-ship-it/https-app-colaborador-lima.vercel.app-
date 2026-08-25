"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";
import { inteiroNaoNegativo } from "@/lib/produtividade-armazem";

const ROTA = "/produtividade-armazem/recebimento";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

export async function registrarRecebimento(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoModulo("pa-recebimento", ROTA);

  const fabricaId = String(formData.get("fabrica_id") ?? "");
  const transportadoraId = String(formData.get("transportadora_id") ?? "");
  const placaCarreta = String(formData.get("placa_carreta") ?? "").trim().toUpperCase();
  const placaCavalo = String(formData.get("placa_cavalo") ?? "").trim().toUpperCase() || null;
  const motoristas = String(formData.get("motoristas") ?? "").trim();
  const ajudanteNome = String(formData.get("ajudante_nome") ?? "").trim() || null;
  const operadorNome = String(formData.get("operador_nome") ?? "").trim() || null;

  if (!fabricaId) erro("Escolha a fábrica de saída.");
  if (!transportadoraId) erro("Escolha a transportadora.");
  if (!placaCarreta) erro("Informe a placa da carreta.");
  if (!motoristas) erro("Informe o nome do(s) motorista(s).");

  const produtoIds = formData.getAll("produto_id").map(String);
  const recebidas = formData.getAll("quantidade_recebida").map(String);
  const avariadas = formData.getAll("quantidade_avariada").map(String);

  if (produtoIds.length === 0 || produtoIds.some((id) => !id)) {
    erro("Adicione ao menos um produto com a quantidade recebida.");
  }

  const itens = produtoIds.map((produtoId, i) => {
    let quantidadeRecebida: number, quantidadeAvariada: number;
    try {
      quantidadeRecebida = inteiroNaoNegativo(recebidas[i]);
      quantidadeAvariada = inteiroNaoNegativo(avariadas[i]);
    } catch {
      erro("Quantidade inválida em um dos produtos.");
    }
    if (quantidadeAvariada > quantidadeRecebida) {
      erro("A quantidade avariada não pode ser maior que a recebida.");
    }
    return { produtoId, quantidadeRecebida, quantidadeAvariada };
  });

  const supabase = await createClient();
  const { data: recebimento, error } = await supabase
    .from("pa_recebimentos")
    .insert({
      revenda_id: revendaId,
      fabrica_id: fabricaId,
      transportadora_id: transportadoraId,
      placa_cavalo: placaCavalo,
      placa_carreta: placaCarreta,
      motoristas,
      conferente_id: perfil.id,
      conferente_nome: perfil.nome,
      ajudante_nome: ajudanteNome,
      operador_nome: operadorNome,
    })
    .select("id")
    .single();

  if (error || !recebimento) {
    erro(`Não foi possível salvar o recebimento: ${error?.message ?? "resposta vazia do banco"}`);
  }

  const { error: erroItens } = await supabase.from("pa_recebimento_itens").insert(
    itens.map((i) => ({
      revenda_id: revendaId,
      recebimento_id: recebimento.id,
      produto_id: i.produtoId,
      quantidade_recebida: i.quantidadeRecebida,
      quantidade_avariada: i.quantidadeAvariada,
    })),
  );

  if (erroItens) erro(`Recebimento salvo, mas os itens falharam: ${erroItens.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Recebimento+registrado`);
}
