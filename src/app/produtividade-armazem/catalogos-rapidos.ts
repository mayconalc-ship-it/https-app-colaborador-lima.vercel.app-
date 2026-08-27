"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { ehUnidadeAg } from "@/lib/carretas";

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

/** Permissão + revenda, o par que toda ação daqui precisa. */
async function contexto(): Promise<{ ok: true; revendaId: string } | { ok: false; erro: string }> {
  if (!(await podeNoModulo("produtividade-armazem", "editar"))) {
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
  const ctx = await contexto();
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
  const ctx = await contexto();
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
  const ctx = await contexto();
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
