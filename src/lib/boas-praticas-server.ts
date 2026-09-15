import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil, type Perfil } from "@/lib/sessao";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { MODULO_BOAS_PRATICAS } from "@/lib/boas-praticas";

/**
 * Quem pode sugerir e votar: qualquer pessoa da revenda, desde que a
 * revenda tenha o módulo ligado.
 *
 * Não usa `temAcessoModulo`: aquela função é a porta dos módulos
 * OPCIONAIS, e barraria o colaborador comum que não tem liberação
 * individual -- que aqui é todo mundo (ver acessos.ts).
 *
 * A tela e as ações chamam esta MESMA função: a regra da tela é a regra
 * do servidor.
 */
export async function contextoBoasPraticas(): Promise<
  { ok: true; perfil: Perfil; revendaId: string } | { ok: false; erro: string }
> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };
  if (!(await revendaTemModulo(MODULO_BOAS_PRATICAS))) {
    return { ok: false, erro: "O programa de Boas Práticas não está ativo nesta revenda." };
  }
  return { ok: true, perfil, revendaId };
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
