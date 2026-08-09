import { cache } from "react";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permissões da pessoa NA REVENDA EM QUE ELA ESTÁ, no formato "modulo:acao".
 *
 * A revenda no filtro é o ponto todo: a mesma liderança pode publicar
 * comunicado em São Félix e só olhar em Barreiras. Sem o filtro, as duas
 * listas se somariam e o acesso mais largo venceria em todo lugar --
 * exatamente o contrário do que se quer ao separar as revendas.
 *
 * Uma consulta por requisição, graças ao cache(): o layout, a página e a
 * verificação de permissão pedem a mesma coisa e o banco é consultado uma
 * vez só. O dono não consulta nada -- ele pode tudo por definição.
 *
 * Mora aqui, e não em sessao.ts, porque precisa saber a revenda ativa --
 * e quem descobre a revenda ativa precisa antes saber quem é a pessoa.
 * Deixar as duas coisas no mesmo arquivo criaria um ciclo de importação.
 */
export const getConcessoes = cache(async (): Promise<Set<string>> => {
  const perfil = await getPerfil();
  if (!perfil || perfil.role !== "lideranca") return new Set<string>();

  const revendaId = await getRevendaId();
  if (!revendaId) return new Set<string>();

  const admin = createAdminClient();
  const { data } = await admin
    .from("lideranca_permissoes")
    .select("modulo, acao")
    .eq("colaborador_id", perfil.id)
    .eq("revenda_id", revendaId);

  return new Set((data ?? []).map((p) => `${p.modulo}:${p.acao}`));
});
