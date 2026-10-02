import "server-only";

import { getConcessoes } from "@/lib/concessoes";
import { getModulosDaRevenda, getRevendaAtiva } from "@/lib/revendas";
import { getModulosAcessiveis } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { ehOwner, podeFazer } from "@/lib/acessos";
import { guiasParaQuem, type Guia } from "@/lib/guia";

/**
 * Os guias que a pessoa logada consegue seguir NESTA revenda.
 *
 * A mesma régua do requireModulo: o módulo precisa estar ligado na
 * revenda e a pessoa precisa da permissão. O dono passa direto -- ele
 * administra tudo, e é quem mais vai mandar o link de um guia adiante.
 *
 * "Ver" tem uma segunda porta, a mesma do temAcessoModulo: o módulo do
 * app liberado para a pessoa (o operador do Reepack, o auditor do 5S).
 * Sem ela, quem mais usa as telas do armazém não veria guia nenhum dele.
 */
export async function guiasDaPessoa(): Promise<Guia[]> {
  const [perfil, concessoes, revenda] = await Promise.all([getPerfil(), getConcessoes(), getRevendaAtiva()]);
  if (!perfil) return guiasParaQuem(() => false);
  if (ehOwner(perfil.role)) return guiasParaQuem(() => true);

  const [modulos, acessiveis] = await Promise.all([
    revenda ? getModulosDaRevenda(revenda.id) : Promise.resolve(new Set<string>()),
    getModulosAcessiveis(),
  ]);
  return guiasParaQuem(
    (m, a) =>
      (modulos.has(m) && podeFazer(perfil.role, concessoes, m, a)) ||
      (a === "ver" && acessiveis.has(m)),
  );
}
