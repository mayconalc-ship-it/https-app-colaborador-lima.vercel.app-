"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { ehUnidadeAg } from "@/lib/carretas";
import type { ModuloId } from "@/lib/acessos";

/**
 * Cadastro rápido dos catálogos de armazém, chamado pelo "+" quadrado azul
 * nos formulários de operação (Portaria, Recebimento, Retorno da carreta) --
 * pedido do dono, 27/08/2026, para padronizar o "adicionar" do app inteiro.
 *
 * Segurança: escrever num catálogo continua exigindo
 * "produtividade-armazem:editar", a MESMA permissão do cadastro no Admin.
 * A tela esconde o "+" de quem não tem, e cada ação confere de novo aqui --
 * botão escondido não é controle de acesso, é só conveniência.
 *
 * Diferente das ações do Admin, estas devolvem um objeto e nunca
 * redirecionam: são chamadas direto do componente cliente, não de um
 * `<form action>`. `valor` é o que vai para o campo, `rotulo` é o que a
 * pessoa lê.
 *
 * Este arquivo é "use server": só pode exportar funções async, nada mais.
 */

type Resultado = { ok: true; valor: string; rotulo: string } | { ok: false; erro: string };

/**
 * Permissão + revenda, o par que toda ação daqui precisa.
 *
 * Passa quem tem a permissão de liderança do catálogo (a mesma do Admin)
 * OU quem está numa das telas de operação que legitimamente precisa
 * cadastrar aquilo na hora -- o conferente descobre uma fábrica de destino
 * ou um AG novo com a carreta parada no pátio, e mandar ele "pedir pro
 * Admin" trava a operação (pedido do dono, 27/08/2026).
 *
 * Mesma ideia que já valia para motorista e empilhador: a liberação
 * individual do módulo é o que autoriza, não a permissão de liderança.
 */
async function contexto(
  modulosDaOperacao: ModuloId[],
): Promise<{ ok: true; revendaId: string } | { ok: false; erro: string }> {
  const permitido = await Promise.all([
    podeNoModulo("produtividade-armazem", "editar"),
    ...modulosDaOperacao.map((m) => temAcessoModulo(m)),
  ]);
  if (!permitido.some(Boolean)) {
    return { ok: false, erro: "Você não tem permissão para cadastrar neste catálogo." };
  }
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };
  return { ok: true, revendaId };
}

function erroDoBanco(mensagem: string, codigo?: string) {
  if (codigo === "23505") return `Já existe um cadastro com esses dados.`;
  return `Não foi possível cadastrar: ${mensagem}`;
}

export async function criarFabricaRapida(formData: FormData): Promise<Resultado> {
  // Porteiro cadastra a fábrica de origem na chegada; conferente cadastra
  // a de destino do retorno. Os dois, com a carreta parada na frente.
  const ctx = await contexto(["carretas-portaria", "carretas-conferencia"]);
  if (!ctx.ok) return ctx;

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome da fábrica." };

  const { data, error } = await createAdminClient()
    .from("pa_fabricas")
    .insert({ revenda_id: ctx.revendaId, nome })
    .select("id, nome")
    .single();
  if (error) return { ok: false, erro: erroDoBanco(error.message, error.code) };

  revalidatePath("/carretas-portaria");
  revalidatePath("/produtividade-armazem/recebimento");
  return { ok: true, valor: data.id, rotulo: data.nome };
}

export async function criarTransportadoraRapida(formData: FormData): Promise<Resultado> {
  // Transportadora nova aparece na chegada, com o motorista esperando.
  const ctx = await contexto(["carretas-portaria"]);
  if (!ctx.ok) return ctx;

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome da transportadora." };

  const { data, error } = await createAdminClient()
    .from("pa_transportadoras")
    .insert({ revenda_id: ctx.revendaId, nome })
    .select("id, nome")
    .single();
  if (error) return { ok: false, erro: erroDoBanco(error.message, error.code) };

  revalidatePath("/carretas-portaria");
  revalidatePath("/produtividade-armazem/recebimento");
  return { ok: true, valor: data.id, rotulo: data.nome };
}

export async function criarAgRapido(formData: FormData): Promise<Resultado> {
  // AG só aparece na decisão de retorno, que é do conferente.
  const ctx = await contexto(["carretas-conferencia"]);
  if (!ctx.ok) return ctx;

  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const unidade = String(formData.get("unidade") ?? "").trim();
  if (!codigo) return { ok: false, erro: "Informe o código do AG." };
  if (!descricao) return { ok: false, erro: "Informe a descrição do AG." };
  if (!ehUnidadeAg(unidade)) return { ok: false, erro: "Escolha a unidade do AG." };

  const { data, error } = await createAdminClient()
    .from("pa_ag_catalogo")
    .insert({ revenda_id: ctx.revendaId, codigo, descricao, unidade })
    .select("id, codigo, descricao")
    .single();
  if (error) return { ok: false, erro: erroDoBanco(error.message, error.code) };

  return { ok: true, valor: data.id, rotulo: `${data.codigo} — ${data.descricao}` };
}
