import { lerFotoDoChamado } from "@/lib/chamados-server";
import { pediuMiniatura, respostaDaFoto } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um Chamado para Manutenção, ou a miniatura (`?tam=mini`). Por
 * que existe: ver lib/foto-privada-server.
 *
 * Mora em /os/ (rota aberta no proxy) porque quem abriu o chamado pelo QR
 * acompanha sem login: para essa pessoa, a trava é o código do chamado no
 * endereço (`?c=`), o mesmo segredo da página de acompanhar. No app, vale
 * a sessão de quem pode ver o chamado.
 */
export async function GET(request: Request, ctx: RouteContext<"/os/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respostaDaFoto(null);
  const codigo = new URL(request.url).searchParams.get("c");
  return respostaDaFoto(await lerFotoDoChamado(id, codigo, pediuMiniatura(request)));
}
