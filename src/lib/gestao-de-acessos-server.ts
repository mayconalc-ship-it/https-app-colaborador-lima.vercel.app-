import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil, type Perfil } from "@/lib/sessao";
import { ehOwner } from "@/lib/acessos";
import { MODULO_ACESSOS, alcanceDe } from "@/lib/gestao-de-acessos";

/**
 * QUEM GERENCIA OS ACESSOS DE UMA REVENDA (11/09/2026).
 *
 * Acessos por Pessoa era só do dono. Agora também entra a liderança que
 * tem o módulo "acessos" NAQUELA revenda -- é assim que o "somente
 * Barreiras ou as duas" se resolve: a permissão é por revenda, como todas.
 *
 * A conferência é sempre na revenda QUE ESTÁ SENDO ALTERADA (a que vem no
 * formulário), e não na que está aberta na sessão: senão bastaria abrir
 * Barreiras e mandar um formulário com o id de São Félix.
 */
export type GestorDeAcessos = {
  eu: Perfil;
  dono: boolean;
  /** "editar" na revenda; quem só tem "ver" consulta e não altera. */
  podeEditar: boolean;
  /** O que ela pode conceder/retirar ali. Nulo = o Admin (tudo). */
  alcance: Set<string> | null;
};

/** As permissões de Modo Liderança de alguém numa revenda. */
export async function permissoesNaRevenda(colaboradorId: string, revendaId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("lideranca_permissoes")
    .select("modulo, acao")
    .eq("colaborador_id", colaboradorId)
    .eq("revenda_id", revendaId);
  return new Set((data ?? []).map((p) => `${p.modulo}:${p.acao}`));
}

async function avaliar(eu: Perfil, revendaId: string): Promise<GestorDeAcessos | null> {
  if (ehOwner(eu.role)) return { eu, dono: true, podeEditar: true, alcance: null };
  if (eu.role !== "lideranca" || !revendaId) return null;

  const admin = createAdminClient();
  const [minhas, { data: modulo }, { data: vinculo }] = await Promise.all([
    permissoesNaRevenda(eu.id, revendaId),
    admin
      .from("revenda_modulos")
      .select("ativo")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_ACESSOS)
      .maybeSingle(),
    admin
      .from("colaborador_revendas")
      .select("revenda_id")
      .eq("colaborador_id", eu.id)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
  ]);
  // Módulo desligado na revenda, ou pessoa sem vínculo com ela: não
  // gerencia nada ali, tenha a permissão gravada ou não.
  if (!modulo?.ativo || !vinculo) return null;

  const podeEditar = minhas.has(`${MODULO_ACESSOS}:editar`);
  if (!podeEditar && !minhas.has(`${MODULO_ACESSOS}:ver`)) return null;
  return { eu, dono: false, podeEditar, alcance: alcanceDe(minhas) };
}

/**
 * A tranca das AÇÕES. `falha` é o redirecionamento de erro de quem chama
 * (cada ação volta para a própria aba).
 */
export async function exigirGestaoDeAcessos(
  revendaId: string,
  acao: "ver" | "editar",
  falha: (mensagem: string) => never,
): Promise<GestorDeAcessos> {
  const eu = await getPerfil();
  if (!eu) redirect("/login");
  if (!revendaId) return falha("Revenda inválida.");

  const gestor = await avaliar(eu, revendaId);
  if (!gestor) return falha("Você não gerencia os acessos desta revenda.");
  if (acao === "editar" && !gestor.podeEditar) {
    return falha("Você pode consultar os acessos desta revenda, mas não alterar.");
  }
  return gestor;
}

/** As revendas em que a pessoa entra em Acessos por Pessoa. */
export async function revendasQueGerencio(eu: Perfil): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminClient();
  const { data: ativas } = await admin.from("revendas").select("id, nome").eq("ativa", true).order("ordem");
  if (ehOwner(eu.role)) return ativas ?? [];
  if (eu.role !== "lideranca") return [];

  const [{ data: perms }, { data: modulos }, { data: vinculos }] = await Promise.all([
    admin
      .from("lideranca_permissoes")
      .select("revenda_id")
      .eq("colaborador_id", eu.id)
      .eq("modulo", MODULO_ACESSOS)
      .in("acao", ["ver", "editar"]),
    admin.from("revenda_modulos").select("revenda_id").eq("modulo", MODULO_ACESSOS).eq("ativo", true),
    admin.from("colaborador_revendas").select("revenda_id").eq("colaborador_id", eu.id),
  ]);
  const comPermissao = new Set((perms ?? []).map((p) => p.revenda_id));
  const comModulo = new Set((modulos ?? []).map((m) => m.revenda_id));
  const vinculadas = new Set((vinculos ?? []).map((v) => v.revenda_id));
  return (ativas ?? []).filter((r) => comPermissao.has(r.id) && comModulo.has(r.id) && vinculadas.has(r.id));
}

/**
 * A tranca da TELA: quem entra, em quais revendas, e o que pode na que
 * está aberta. Sem nenhuma revenda, volta para o painel com o motivo.
 */
export async function exigirTelaDeAcessos(revendaParam?: string) {
  const eu = await getPerfil();
  if (!eu) redirect("/login");

  const revendas = await revendasQueGerencio(eu);
  if (revendas.length === 0) {
    redirect(`/admin?erro=${encodeURIComponent("Você não tem acesso a Acessos por Pessoa.")}`);
  }
  const escolhida = revendas.find((r) => r.id === revendaParam) ?? revendas[0];

  const gestor = await avaliar(eu, escolhida.id);
  if (!gestor) {
    redirect(`/admin?erro=${encodeURIComponent("Você não gerencia os acessos desta revenda.")}`);
  }
  return { ...gestor, revendas, escolhida };
}

/**
 * A pessoa também gerencia acessos, em alguma revenda? Quem gerencia não
 * mexe em quem gerencia -- só o Admin. Sem isso, duas lideranças poderiam
 * se ampliar uma à outra.
 */
export async function gerenciaAcessos(colaboradorId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("lideranca_permissoes")
    .select("*", { count: "exact", head: true })
    .eq("colaborador_id", colaboradorId)
    .eq("modulo", MODULO_ACESSOS);
  return (count ?? 0) > 0;
}
