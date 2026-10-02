import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ModuloNaoInstalado } from "@/lib/manutencao-server";
import {
  ehLetra,
  problemasDaAtividade,
  type Categoria,
  type Fornecedor,
  type Frequencia,
  type Letra,
  type SituacaoAns,
} from "@/lib/manutencao-raci";

/**
 * Leitura da base de fornecedores e da RACI (migration 157). Mesmo
 * cuidado da 156: sem as tabelas, a tela avisa em vez de quebrar.
 */

type Admin = ReturnType<typeof createAdminClient>;

function conferir(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message)) {
    throw new ModuloNaoInstalado(error.message);
  }
  throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------

type FornecedorBanco = {
  id: string;
  nome: string;
  categoria: string;
  tipo_servico: string;
  telefone: string;
  cidade: string | null;
  frequencia: string;
  ans: string | null;
  custo: string | null;
  critico: boolean;
  situacao_ans: string;
  motivo_revisao: string | null;
  ans_revisada_em: string | null;
  observacao: string | null;
  atualizado_por_nome: string | null;
  atualizado_em: string | null;
};

export async function lerFornecedores(revendaId: string, admin: Admin = createAdminClient()): Promise<Fornecedor[]> {
  const { data, error } = await admin
    .from("manut_fornecedores")
    .select(
      "id, nome, categoria, tipo_servico, telefone, cidade, frequencia, ans, custo, critico, situacao_ans, motivo_revisao, ans_revisada_em, observacao, atualizado_por_nome, atualizado_em",
    )
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .order("nome");
  conferir(error);
  return ((data ?? []) as FornecedorBanco[]).map((f) => ({
    id: f.id,
    nome: f.nome,
    categoria: f.categoria as Categoria,
    tipoServico: f.tipo_servico,
    telefone: f.telefone,
    cidade: f.cidade,
    frequencia: f.frequencia as Frequencia,
    ans: f.ans,
    custo: f.custo,
    critico: f.critico,
    situacaoAns: f.situacao_ans as SituacaoAns,
    motivoRevisao: f.motivo_revisao,
    ansRevisadaEm: f.ans_revisada_em,
    observacao: f.observacao,
    atualizadoPorNome: f.atualizado_por_nome,
    atualizadoEm: f.atualizado_em,
  }));
}

// ---------------------------------------------------------------------
// RACI
// ---------------------------------------------------------------------

export type PapelRaci = { id: string; nome: string; tipo: "area" | "fornecedor"; ordem: number };
export type AtividadeRaci = { id: string; nome: string; critica: boolean; ordem: number };
export type RevisaoRaci = { id: string; revisadaEm: string; revisadaPorNome: string; observacao: string | null };

export type MatrizRaci = {
  papeis: PapelRaci[];
  atividades: AtividadeRaci[];
  /** `${atividadeId}:${papelId}` -> letra */
  letras: Record<string, Letra>;
  revisoes: RevisaoRaci[];
  /** atividadeId -> problemas (só as que têm algum) */
  problemas: Record<string, string[]>;
};

export const chaveCelula = (atividadeId: string, papelId: string) => `${atividadeId}:${papelId}`;

export async function lerMatriz(revendaId: string, admin: Admin = createAdminClient()): Promise<MatrizRaci> {
  const [p, a, c, r] = await Promise.all([
    admin.from("manut_raci_papeis").select("id, nome, tipo, ordem").eq("revenda_id", revendaId).eq("ativo", true).order("ordem"),
    admin.from("manut_raci_atividades").select("id, nome, critica, ordem").eq("revenda_id", revendaId).eq("ativo", true).order("ordem"),
    admin.from("manut_raci_celulas").select("atividade_id, papel_id, letra").eq("revenda_id", revendaId),
    admin
      .from("manut_raci_revisoes")
      .select("id, revisada_em, revisada_por_nome, observacao")
      .eq("revenda_id", revendaId)
      .order("revisada_em", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(12),
  ]);
  conferir(p.error);
  conferir(a.error);
  conferir(c.error);
  conferir(r.error);

  const papeis = (p.data ?? []) as PapelRaci[];
  const atividades = (a.data ?? []) as AtividadeRaci[];
  const letras: Record<string, Letra> = {};
  for (const x of (c.data ?? []) as { atividade_id: string; papel_id: string; letra: string }[]) {
    if (ehLetra(x.letra)) letras[chaveCelula(x.atividade_id, x.papel_id)] = x.letra;
  }
  const problemas: Record<string, string[]> = {};
  for (const at of atividades) {
    const lista = problemasDaAtividade(papeis.map((pp) => letras[chaveCelula(at.id, pp.id)]));
    if (lista.length) problemas[at.id] = lista;
  }
  const revisoes = ((r.data ?? []) as { id: string; revisada_em: string; revisada_por_nome: string; observacao: string | null }[]).map(
    (x) => ({ id: x.id, revisadaEm: x.revisada_em, revisadaPorNome: x.revisada_por_nome, observacao: x.observacao }),
  );
  return { papeis, atividades, letras, revisoes, problemas };
}
