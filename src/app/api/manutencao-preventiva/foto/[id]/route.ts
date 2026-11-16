import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { MODULO_PREVENTIVA, lerFotoDaPreventiva } from "@/lib/manutencao-preventiva-server";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um item da Manutenção Preventiva, ou a miniatura (`?tam=mini`).
 * Endereço fixo e cache longo -- ver lib/foto-privada-server. A trava é a
 * mesma das telas da preventiva, e a foto tem de ser da revenda ativa.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/manutencao-preventiva/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);

  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_PREVENTIVA))) return new Response("Sem acesso.", { status: 403 });

  return respostaDaFoto(await lerFotoDaPreventiva(id, revendaId, pediuMiniatura(request)));
}
