import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil, type Perfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { ehOwner, podeFazer } from "@/lib/acessos";
import { areaDoColaborador } from "@/lib/quiz";
import {
  MODULO_BOAS_PRATICAS,
  normalizarConfig,
  type ConfigBoasPraticas,
} from "@/lib/boas-praticas";

/** A configuração do programa na revenda (áreas, calendário, prêmios). */
export async function lerConfigBoasPraticas(revendaId: string): Promise<ConfigBoasPraticas> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("boas_praticas_config")
    .select("todas_areas, areas, sugestoes_ate, votacao_ate, divulgacao_em, premio_1, premio_2, premio_3")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  return normalizarConfig(data);
}

/**
 * A pessoa participa? AS ÁREAS MARCADAS EM CONFIGURAÇÃO (15/09/2026).
 *
 * A área vem do cadastro, lida pelo mesmo tradutor do Desafio do Mês
 * (`areaDoColaborador`): "DISTRIBUIÇÃO URBANA" vira DU, "ARMAZÉM" vira AL.
 * Quem está com uma área que ele não reconhece fica de fora até o cadastro
 * ser corrigido -- a tela de Configuração mostra quantos são.
 *
 * O dono e a liderança que conduz o programa passam sempre: quem avalia
 * precisa enxergar a tela do colaborador, seja de que área for.
 *
 * Uma função só para a home, para a prévia de acesso e para as ações.
 */
export function participaPorArea(
  config: ConfigBoasPraticas,
  pessoa: { role: string; area: string | null },
  concessoes: Set<string>,
) {
  // "Todas as áreas" (15/09/2026): a revenda inteira, inclusive quem está
  // sem área reconhecida no cadastro.
  if (config.todas_areas) return true;
  if (ehOwner(pessoa.role)) return true;
  if (podeFazer(pessoa.role, concessoes, MODULO_BOAS_PRATICAS, "ver")) return true;
  const area = areaDoColaborador(pessoa.area);
  return area !== null && config.areas.includes(area);
}

/** O cartão da home some para quem não participa. */
export async function boasPraticasForaDaArea(
  pessoa: { role: string; area: string | null },
  concessoes: Set<string>,
  revendaId: string,
  modulosDaRevenda: Set<string>,
) {
  if (!modulosDaRevenda.has(MODULO_BOAS_PRATICAS)) return false;
  const config = await lerConfigBoasPraticas(revendaId);
  return !participaPorArea(config, pessoa, concessoes);
}

/**
 * Quem pode sugerir e votar: a pessoa da revenda com o módulo ligado, das
 * áreas que participam.
 *
 * Não usa `temAcessoModulo`: aquela função é a porta dos módulos
 * OPCIONAIS, e barraria o colaborador comum sem liberação individual --
 * que aqui é todo mundo (ver acessos.ts).
 *
 * A tela e as ações chamam esta MESMA função.
 */
export async function contextoBoasPraticas(): Promise<
  | { ok: true; perfil: Perfil; revendaId: string; config: ConfigBoasPraticas }
  | { ok: false; erro: string }
> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };
  if (!(await revendaTemModulo(MODULO_BOAS_PRATICAS))) {
    return { ok: false, erro: "O programa de Boas Práticas não está ativo nesta revenda." };
  }
  const [config, concessoes] = await Promise.all([lerConfigBoasPraticas(revendaId), getConcessoes()]);
  if (!participaPorArea(config, perfil, concessoes)) {
    return { ok: false, erro: "O programa de Boas Práticas ainda não está aberto para a sua área." };
  }
  return { ok: true, perfil, revendaId, config };
}

/**
 * Quem vota pelo app nesta revenda: a liderança e o dono (22/09/2026).
 * É a lista do aviso de votação aberta e da participação na tela da
 * liderança.
 */
export async function eleitoresDaRevenda(revendaId: string): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminClient();
  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const ids = [...new Set((vinculos ?? []).map((v) => v.colaborador_id as string))];
  const eleitores: { id: string; nome: string }[] = [];
  // Em lotes: a lista de ids vai na URL da consulta.
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin
      .from("profiles")
      .select("id, nome, role")
      .in("id", ids.slice(i, i + 150))
      .in("role", ["lideranca", "owner"]);
    for (const p of data ?? []) eleitores.push({ id: p.id as string, nome: (p.nome as string) ?? "" });
  }
  return eleitores.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Liderança com "Boas Práticas: editar" na revenda -- quem avalia a
 * sugestão nova. Mesmo critério de `podeFazer`: a concessão só vale para
 * quem ainda é liderança.
 */
export async function quemAvaliaBoasPraticas(revendaId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: permissoes } = await admin
    .from("lideranca_permissoes")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("modulo", MODULO_BOAS_PRATICAS)
    .eq("acao", "editar");
  const ids = [...new Set((permissoes ?? []).map((p) => p.colaborador_id as string))];
  if (ids.length === 0) return [];
  const { data: pessoas } = await admin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("role", "lideranca");
  return (pessoas ?? []).map((p) => p.id as string);
}
