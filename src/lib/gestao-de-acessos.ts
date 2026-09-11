/**
 * GESTÃO DE ACESSOS DELEGADA -- as regras puras (11/09/2026).
 *
 * Pedido do dono: liberar "Acessos por Pessoa" para a liderança de
 * Barreiras, "somente Barreiras ou das duas revendas". A tela era só do
 * dono, e por um motivo que continua valendo: quem mexe em quem pode o quê
 * pode aumentar o próprio poder. A delegação existe, então, com um ALCANCE:
 *
 *   - a liderança só concede e só retira o que ELA MESMA tem naquela
 *     revenda -- o resto da ficha de quem ela edita fica como está;
 *   - a gestão de acessos nunca está no alcance: ninguém a repassa.
 *
 * Sem banco aqui, para as regras caberem num teste.
 */

/** O módulo que abre Acessos por Pessoa para quem não é o Admin. */
export const MODULO_ACESSOS = "acessos";

export function ehDaGestaoDeAcessos(chave: string) {
  return chave.startsWith(`${MODULO_ACESSOS}:`);
}

/**
 * O que uma liderança pode conceder/retirar numa revenda: as permissões
 * dela ali, menos a própria gestão de acessos.
 */
export function alcanceDe(concessoes: Iterable<string>): Set<string> {
  return new Set([...concessoes].filter((c) => !ehDaGestaoDeAcessos(c)));
}

/**
 * A ficha que fica gravada depois de um salvar.
 *
 * `alcance` nulo é o Admin: vale exatamente o que foi marcado. Para a
 * liderança, o que está FORA do alcance dela fica como estava -- nem entra
 * o que ela marcou lá (uma caixa travada não chega pelo formulário, mas o
 * formulário é do navegador de quem envia), nem sai o que já existia.
 */
export function mesclarNoAlcance(
  existentes: Iterable<string>,
  marcadas: Iterable<string>,
  alcance: Set<string> | null,
): string[] {
  if (alcance === null) return [...new Set(marcadas)];
  const saida = new Set<string>();
  for (const c of existentes) if (!alcance.has(c)) saida.add(c);
  for (const c of marcadas) if (alcance.has(c)) saida.add(c);
  return [...saida];
}
