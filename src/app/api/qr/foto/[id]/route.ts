import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { MODULO_QR } from "@/lib/qr-contingencia";
import { lerFotoDoComprovante } from "@/lib/qr-contingencia-server";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um comprovante do QR de Contingência, ou a miniatura dela
 * (`?tam=mini`). Por que existe: ver lib/foto-privada-server.
 *
 * A trava é a mesma da tela do motorista (temAcessoModulo, que também
 * deixa passar quem confere com "ver"), e a foto tem de ser da revenda
 * ativa. O bucket continua privado: sem sessão, o proxy manda para o login.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/qr/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);

  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_QR))) return new Response("Sem acesso.", { status: 403 });

  return respostaDaFoto(await lerFotoDoComprovante(id, revendaId, pediuMiniatura(request)));
}
