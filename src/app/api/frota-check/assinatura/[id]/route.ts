import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { lerAssinatura } from "@/lib/frota-check-server";
import { MODULO_FROTA_CHECK } from "@/lib/frota-check";
import { respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/** A assinatura desenhada de um check (PNG), da revenda ativa. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);
  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_FROTA_CHECK))) return new Response("Sem acesso.", { status: 403 });
  return respostaDaFoto(await lerAssinatura(id, revendaId));
}
