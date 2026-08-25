import "server-only";

import { redirect } from "next/navigation";
import { requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import type { ModuloId } from "@/lib/acessos";

/**
 * A dupla checagem que toda ação de servidor deste recurso precisa: a
 * pessoa tem concessão pro módulo certo (portaria OU conferência -- são
 * dois módulos separados de propósito, ver migration 057) e está numa
 * revenda de verdade. `destino` é a rota do próprio módulo, pra onde o
 * erro volta.
 */
export async function exigirContextoCarretas(modulo: ModuloId, destino: string) {
  const perfil = await requireAcessoModulo(modulo, destino);
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect(`${destino}?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);
  }
  return { perfil, revendaId };
}
