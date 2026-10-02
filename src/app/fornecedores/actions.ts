"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { temAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { deuCerto, deuErrado, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_MANUTENCAO } from "@/lib/manutencao-server";
import { problemaDoFornecedor } from "@/lib/manutencao-raci";

/**
 * Base de fornecedores (migration 157). CONSULTAR é de todo mundo da
 * unidade (V.3); INCLUIR E ATUALIZAR é do time da manutenção -- quem tem
 * o Check de Manutenção liberado.
 */

function texto(fd: FormData, campo: string, max = 300) {
  return String(fd.get(campo) ?? "").trim().slice(0, max);
}
const ouNulo = (v: string) => (v === "" ? null : v);

async function contexto() {
  const [perfil, revendaId, podeEditar] = await Promise.all([getPerfil(), getRevendaId(), temAcessoModulo(MODULO_MANUTENCAO)]);
  if (!perfil || !revendaId) return { ok: false as const, erro: "Sessão encerrada. Entre de novo no app." };
  if (!podeEditar) return { ok: false as const, erro: "Quem atualiza a base é o time da manutenção. Fale com ele." };
  return { ok: true as const, perfil, revendaId };
}

function revalidar() {
  revalidatePath("/fornecedores");
  revalidatePath("/manutencao");
}

/** Inclui (sem id) ou atualiza (com id) um fornecedor. */
export async function salvarFornecedor(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const entrada = {
    nome: texto(fd, "nome", 120),
    categoria: texto(fd, "categoria", 20),
    tipoServico: texto(fd, "tipo_servico", 160),
    telefone: texto(fd, "telefone", 40),
  };
  const problema = problemaDoFornecedor(entrada);
  if (problema) return deuErrado(problema);

  const linha = {
    nome: entrada.nome,
    categoria: entrada.categoria,
    tipo_servico: entrada.tipoServico,
    telefone: entrada.telefone,
    cidade: ouNulo(texto(fd, "cidade", 80)),
    frequencia: texto(fd, "frequencia", 10) === "comum" ? "comum" : "raro",
    ans: ouNulo(texto(fd, "ans")),
    custo: ouNulo(texto(fd, "custo", 200)),
    critico: fd.get("critico") === "on",
    observacao: ouNulo(texto(fd, "observacao", 500)),
    atualizado_por: ctx.perfil.id,
    atualizado_por_nome: ctx.perfil.nome,
    atualizado_em: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const id = texto(fd, "id", 64);
  const { error } = id
    ? await admin.from("manut_fornecedores").update(linha).eq("id", id).eq("revenda_id", ctx.revendaId)
    : await admin.from("manut_fornecedores").insert({ ...linha, revenda_id: ctx.revendaId });
  if (error) {
    if (error.code === "23505") return deuErrado(`Já existe "${entrada.nome}" na base. Edite o que já está lá.`);
    return deuErrado(`Não foi possível salvar: ${error.message}`);
  }
  revalidar();
  return deuCerto(id ? `${entrada.nome} atualizado.` : `${entrada.nome} incluído na base.`);
}

/** Tira da base (fica guardado, só some da lista). */
export async function removerFornecedor(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const { error } = await createAdminClient()
    .from("manut_fornecedores")
    .update({ ativo: false, atualizado_por: ctx.perfil.id, atualizado_por_nome: ctx.perfil.nome, atualizado_em: new Date().toISOString() })
    .eq("id", texto(fd, "id", 64))
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível remover: ${error.message}`);
  revalidar();
  return deuCerto("Fornecedor removido da base.");
}

/**
 * O serviço não foi adequado: o ANS precisa ser revisto com o fornecedor
 * (V.4). Fica marcado na base -- e no painel -- até a revisão.
 */
export async function marcarAnsParaRevisar(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const motivo = texto(fd, "motivo", 500);
  if (motivo.length < 5) return deuErrado("Conte em poucas palavras o que não foi adequado no serviço.");
  const { error } = await createAdminClient()
    .from("manut_fornecedores")
    .update({
      situacao_ans: "revisar",
      motivo_revisao: motivo,
      atualizado_por: ctx.perfil.id,
      atualizado_por_nome: ctx.perfil.nome,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", texto(fd, "id", 64))
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível marcar: ${error.message}`);
  revalidar();
  return deuCerto("Marcado: o ANS será revisto com o fornecedor.");
}

/** Revisou com o fornecedor: grava o ANS combinado e a data. */
export async function registrarAnsRevisto(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const ans = texto(fd, "ans");
  if (ans.length < 2) return deuErrado("Escreva o ANS combinado com o fornecedor (ex.: atende em até 4 h).");
  const { error } = await createAdminClient()
    .from("manut_fornecedores")
    .update({
      ans,
      situacao_ans: "em_dia",
      ans_revisada_em: hojeIso(),
      atualizado_por: ctx.perfil.id,
      atualizado_por_nome: ctx.perfil.nome,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", texto(fd, "id", 64))
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível salvar: ${error.message}`);
  revalidar();
  return deuCerto("ANS revisto e registrado.");
}
