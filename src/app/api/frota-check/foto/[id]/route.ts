import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { lerFotoDaFrota } from "@/lib/frota-check-server";
import { MODULO_FROTA_CHECK } from "@/lib/frota-check";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/** A foto de um NOK do Check da Frota (ou a miniatura, `?tam=mini`), da revenda ativa. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);
  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_FROTA_CHECK))) return new Response("Sem acesso.", { status: 403 });
  return respostaDaFoto(await lerFotoDaFrota(id, revendaId, pediuMiniatura(request)));
}
