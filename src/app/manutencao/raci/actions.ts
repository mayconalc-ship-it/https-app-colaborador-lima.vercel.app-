"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { temAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { deuCerto, deuErrado, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_MANUTENCAO } from "@/lib/manutencao-server";
import { lerMatriz } from "@/lib/manutencao-raci-server";
import { dataBr, ehLetra, situacaoDaRevisao } from "@/lib/manutencao-raci";

/**
 * A RACI da manutenção (migration 157, V.4). Quem mexe é quem tem o
 * Check de Manutenção -- o mesmo time que responde pela matriz.
 */

const BASE = "/manutencao/raci";

function texto(fd: FormData, campo: string, max = 200) {
  return String(fd.get(campo) ?? "").trim().slice(0, max);
}

async function contexto() {
  const [perfil, revendaId, temAcesso] = await Promise.all([getPerfil(), getRevendaId(), temAcessoModulo(MODULO_MANUTENCAO)]);
  if (!perfil || !revendaId) return { ok: false as const, erro: "Sessão encerrada. Entre de novo no app." };
  if (!temAcesso) return { ok: false as const, erro: "Você não tem acesso ao Check de Manutenção. Fale com o Admin." };
  return { ok: true as const, perfil, revendaId };
}

function revalidar() {
  revalidatePath(BASE);
  revalidatePath("/manutencao");
}

/**
 * Grava a letra de uma célula (vazio apaga). A tela manda a letra que
 * QUER, não "a próxima": dois toques rápidos que chegam fora de ordem
 * terminam no que está na tela.
 */
export async function definirLetra(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const atividadeId = texto(fd, "atividade_id", 64);
  const papelId = texto(fd, "papel_id", 64);
  const letra = texto(fd, "letra", 1);
  const admin = createAdminClient();

  // As duas pontas têm de ser desta revenda.
  const [{ data: at }, { data: pa }] = await Promise.all([
    admin.from("manut_raci_atividades").select("id").eq("id", atividadeId).eq("revenda_id", ctx.revendaId).maybeSingle(),
    admin.from("manut_raci_papeis").select("id").eq("id", papelId).eq("revenda_id", ctx.revendaId).maybeSingle(),
  ]);
  if (!at || !pa) return deuErrado("Linha ou coluna não encontrada nesta revenda.");

  const { error } =
    letra === ""
      ? await admin.from("manut_raci_celulas").delete().eq("atividade_id", atividadeId).eq("papel_id", papelId)
      : ehLetra(letra)
        ? await admin.from("manut_raci_celulas").upsert(
            {
              atividade_id: atividadeId,
              papel_id: papelId,
              revenda_id: ctx.revendaId,
              letra,
              atualizado_por_nome: ctx.perfil.nome,
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: "atividade_id,papel_id" },
          )
        : { error: { message: "Letra inválida." } };
  if (error) return deuErrado(`Não foi possível salvar: ${error.message}`);
  revalidar();
  return deuCerto(letra ? `Marcado ${letra}.` : "Célula limpa.");
}

export async function adicionarAtividade(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const nome = texto(fd, "nome");
  if (nome.length < 3) return deuErrado("Descreva a atividade.");
  const admin = createAdminClient();
  const { data: ultima } = await admin
    .from("manut_raci_atividades")
    .select("ordem")
    .eq("revenda_id", ctx.revendaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const linha = { revenda_id: ctx.revendaId, nome, critica: fd.get("critica") === "on", ativo: true };
  // Uma atividade tirada antes volta com o mesmo nome, em vez de dar "já existe".
  const { error } = await admin
    .from("manut_raci_atividades")
    .upsert({ ...linha, ordem: (ultima?.ordem ?? 0) + 1 }, { onConflict: "revenda_id,nome" });
  if (error) return deuErrado(`Não foi possível incluir: ${error.message}`);
  revalidar();
  return deuCerto("Atividade incluída. Marque quem é R e quem é A.");
}

export async function adicionarPapel(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const nome = texto(fd, "nome", 60);
  if (nome.length < 2) return deuErrado("Informe a área ou o fornecedor.");
  const tipo = texto(fd, "tipo", 12) === "fornecedor" ? "fornecedor" : "area";
  const admin = createAdminClient();
  const { data: ultimo } = await admin
    .from("manut_raci_papeis")
    .select("ordem")
    .eq("revenda_id", ctx.revendaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin
    .from("manut_raci_papeis")
    .upsert({ revenda_id: ctx.revendaId, nome, tipo, ativo: true, ordem: (ultimo?.ordem ?? 0) + 1 }, { onConflict: "revenda_id,nome" });
  if (error) return deuErrado(`Não foi possível incluir: ${error.message}`);
  revalidar();
  return deuCerto(`${nome} incluído na matriz.`);
}

/** Tira uma linha ou coluna (guarda, para não perder o histórico). */
export async function removerDaMatriz(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const tabela = texto(fd, "o_que", 12) === "papel" ? "manut_raci_papeis" : "manut_raci_atividades";
  const { error } = await createAdminClient()
    .from(tabela)
    .update({ ativo: false })
    .eq("id", texto(fd, "id", 64))
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível tirar: ${error.message}`);
  revalidar();
  return deuCerto(tabela === "manut_raci_papeis" ? "Coluna tirada da matriz." : "Atividade tirada da matriz.");
}

/**
 * "Revisamos a RACI": só com a matriz sem regra quebrada -- revisar uma
 * matriz com linha sem A seria registrar como vigente o que não está.
 */
export async function registrarRevisao(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const admin = createAdminClient();
  const matriz = await lerMatriz(ctx.revendaId, admin);
  const comProblema = matriz.atividades.filter((a) => matriz.problemas[a.id]);
  if (matriz.atividades.length === 0) return deuErrado("A matriz está vazia.");
  if (comProblema.length > 0) {
    return deuErrado(
      `Acerte antes ${comProblema.length === 1 ? "a atividade" : `as ${comProblema.length} atividades`} em vermelho: ${comProblema
        .slice(0, 2)
        .map((a) => `"${a.nome}" (${matriz.problemas[a.id].join("; ")})`)
        .join(", ")}${comProblema.length > 2 ? "…" : ""}.`,
    );
  }

  const hoje = hojeIso();
  const { error } = await admin.from("manut_raci_revisoes").insert({
    revenda_id: ctx.revendaId,
    revisada_em: hoje,
    revisada_por: ctx.perfil.id,
    revisada_por_nome: ctx.perfil.nome,
    observacao: texto(fd, "observacao", 500) || null,
  });
  if (error) return deuErrado(`Não foi possível registrar: ${error.message}`);
  revalidar();
  const s = situacaoDaRevisao(hoje, hoje);
  return deuCerto(`RACI revista. Vigente até ${s.tipo === "em_dia" ? dataBr(s.venceEm) : "—"}.`);
}
