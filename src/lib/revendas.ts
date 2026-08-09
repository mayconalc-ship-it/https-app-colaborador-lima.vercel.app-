import { cache } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { ehOwner, type ModuloId } from "@/lib/acessos";

export type Revenda = {
  id: string;
  slug: string;
  nome: string;
  ativa: boolean;
  /** Só a revenda marcada como padrão da pessoa. O dono não tem principal. */
  principal: boolean;
};

/**
 * Guarda a revenda escolhida por quem tem mais de um vínculo. Não é
 * credencial: quem manda é a tabela de vínculos, e o valor daqui só passa
 * depois de conferido contra ela. Um cookie forjado não abre porta nenhuma,
 * apenas é ignorado.
 */
export const COOKIE_REVENDA = "lima_revenda";

/**
 * As revendas a que a pessoa pertence.
 *
 * O dono é o único que enxerga todas: ele administra o app inteiro, e
 * exigir vínculo dele seria burocracia que não protege nada.
 *
 * Lê pela chave de administrador porque `colaborador_revendas` não tem
 * política de leitura nenhuma -- é o que impede alguém de se vincular a
 * outra revenda pela porta dos fundos.
 */
export const getRevendas = cache(async (): Promise<Revenda[]> => {
  const perfil = await getPerfil();
  if (!perfil) return [];

  const admin = createAdminClient();

  if (ehOwner(perfil.role)) {
    const { data } = await admin
      .from("revendas")
      .select("id, slug, nome, ativa")
      .eq("ativa", true)
      .order("ordem");

    return (data ?? []).map((r) => ({ ...r, principal: false }));
  }

  const { data } = await admin
    .from("colaborador_revendas")
    .select("principal, revendas!inner(id, slug, nome, ativa, ordem)")
    .eq("colaborador_id", perfil.id)
    .eq("revendas.ativa", true)
    .order("ordem", { referencedTable: "revendas" });

  return (data ?? []).map((v) => {
    const r = v.revendas as unknown as Omit<Revenda, "principal">;
    return { ...r, principal: v.principal };
  });
});

/**
 * A revenda em que a pessoa está trabalhando agora.
 *
 * Quem tem um vínculo só nunca escolhe nada -- o app deduz e entra direto.
 * A escolha só existe para quem responde por mais de uma revenda, e mesmo
 * assim tem um padrão para não travar o login.
 *
 * Devolve null só em dois casos: não está logado, ou está logado e não tem
 * vínculo nenhum. O segundo é o "colaborador sem revenda", que o app trata
 * como acesso incompleto em vez de mostrar tela vazia.
 */
export const getRevendaAtiva = cache(async (): Promise<Revenda | null> => {
  const revendas = await getRevendas();
  if (revendas.length === 0) return null;

  const escolhida = (await cookies()).get(COOKIE_REVENDA)?.value;
  // O cookie só vale se a pessoa realmente tiver o vínculo. É aqui que a
  // regra "só entra na revenda a que pertence" é cobrada de fato.
  const valida = escolhida && revendas.find((r) => r.id === escolhida);
  if (valida) return valida;

  return revendas.find((r) => r.principal) ?? revendas[0];
});

/** Atalho para quem só precisa do id -- que é a maioria das consultas. */
export async function getRevendaId(): Promise<string | null> {
  return (await getRevendaAtiva())?.id ?? null;
}

/** Precisa escolher? Só quem tem mais de uma. É o que decide se o seletor aparece. */
export async function temMaisDeUmaRevenda() {
  return (await getRevendas()).length > 1;
}

/**
 * Módulos que ESTA revenda usa.
 *
 * É a camada mais externa do controle de acesso, e vem antes da permissão
 * individual: se a revenda não contratou o módulo, não existe permissão de
 * pessoa que faça a tela aparecer para alguém dela.
 */
export const getModulosDaRevenda = cache(
  async (revendaId: string): Promise<Set<string>> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("revenda_modulos")
      .select("modulo")
      .eq("revenda_id", revendaId)
      .eq("ativo", true);

    return new Set((data ?? []).map((m) => m.modulo));
  },
);

/** O módulo está ligado na revenda em que a pessoa está agora? */
export async function revendaTemModulo(modulo: ModuloId) {
  const revendaId = await getRevendaId();
  if (!revendaId) return false;
  return (await getModulosDaRevenda(revendaId)).has(modulo);
}
