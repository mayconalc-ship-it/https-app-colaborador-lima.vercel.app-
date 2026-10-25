import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { MODULO_MANUTENCAO, lerFotoDaManutencao } from "@/lib/manutencao-server";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um item do Check de Manutenção, ou a miniatura (`?tam=mini`).
 * Por que existe: ver lib/foto-privada-server. A trava é a mesma das
 * telas do check (requireAcessoModulo), e a foto tem de ser da revenda ativa.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/manutencao/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);

  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_MANUTENCAO))) return new Response("Sem acesso.", { status: 403 });

  return respostaDaFoto(await lerFotoDaManutencao(id, revendaId, pediuMiniatura(request)));
}
