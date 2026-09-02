import { cache } from "react";
import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaId, getModulosDaRevenda } from "@/lib/revendas";
import { podeFazer } from "@/lib/acessos";
import { PAINEIS, type Painel } from "@/lib/gestao";

/**
 * Os painéis que ESTA pessoa pode abrir, nesta revenda.
 *
 * A régua é a de sempre -- `podeFazer(modulo, "ver")` -- e é de propósito
 * que seja a de gestão mesmo nos dois painéis que não se mudaram: aqui é
 * a área de quem administra. O operador de empilhadeira continua abrindo
 * o painel de gás pelo caminho dele, sem passar por aqui e sem precisar
 * de concessão nova; o que este filtro decide é só o que aparece NESTA
 * barra.
 *
 * Duas perguntas, nesta ordem, iguais às do Modo Liderança: a revenda usa
 * o módulo? e esta pessoa pode abri-lo? A primeira vale até para o dono.
 */
export const paineisVisiveis = cache(async (): Promise<Painel[]> => {
  const perfil = await getPerfil();
  if (!perfil) return [];

  const revendaId = await getRevendaId();
  if (!revendaId) return [];

  const [concessoes, modulosDaRevenda] = await Promise.all([
    getConcessoes(),
    getModulosDaRevenda(revendaId),
  ]);

  return PAINEIS.filter(
    (p) => modulosDaRevenda.has(p.modulo) && podeFazer(perfil.role, concessoes, p.modulo, "ver"),
  );
});
