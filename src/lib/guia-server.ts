import "server-only";

import { getConcessoes } from "@/lib/concessoes";
import { getModulosDaRevenda, getRevendaAtiva } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { ehOwner, podeFazer } from "@/lib/acessos";
import { guiasParaQuem, type Guia } from "@/lib/guia";

/**
 * Os guias que a pessoa logada consegue seguir NESTA revenda.
 *
 * A mesma régua do requireModulo: o módulo precisa estar ligado na
 * revenda e a pessoa precisa da permissão. O dono passa direto -- ele
 * administra tudo, e é quem mais vai mandar o link de um guia adiante.
 */
export async function guiasDaPessoa(): Promise<Guia[]> {
  const [perfil, concessoes, revenda] = await Promise.all([getPerfil(), getConcessoes(), getRevendaAtiva()]);
  if (!perfil) return guiasParaQuem(() => false);
  if (ehOwner(perfil.role)) return guiasParaQuem(() => true);

  const modulos = revenda ? await getModulosDaRevenda(revenda.id) : new Set<string>();
  return guiasParaQuem((m, a) => modulos.has(m) && podeFazer(perfil.role, concessoes, m, a));
}
