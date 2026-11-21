/**
 * Telas que abrem em NOVA GUIA ao clicar no cartão (21/11/2026, pedido do
 * dono). O Gestor LOG é um programa de tela cheia, fora do layout do app:
 * abrir por cima tirava a pessoa do app, e voltar recarregava tudo.
 */
const ABREM_EM_NOVA_GUIA = new Set(["/gestor-log"]);

/** Props de link para abrir em nova guia, ou nada. */
export function propsDeNovaGuia(href: string) {
  return ABREM_EM_NOVA_GUIA.has(href) ? { target: "_blank", rel: "noopener" } : {};
}
