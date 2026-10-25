import { getContexto5S } from "@/lib/cinco-s-server";
import { lerFotoDoReconhecimento } from "@/lib/cinco-s-reconhecimento-server";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um reconhecimento do 5S, ou a miniatura (`?tam=mini`). Por que
 * existe: ver lib/foto-privada-server. A trava é a do BI do 5S, onde os
 * reconhecimentos aparecem: quem participa do programa, na revenda dele.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/5s/reconhecimento/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);

  const contexto = await getContexto5S();
  if (!contexto?.temAcesso || !contexto.revendaId) return new Response("Sem acesso.", { status: 403 });

  return respostaDaFoto(await lerFotoDoReconhecimento(id, contexto.revendaId, pediuMiniatura(request)));
}
