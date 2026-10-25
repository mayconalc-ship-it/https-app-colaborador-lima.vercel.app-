import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { MODULO_QR } from "@/lib/qr-contingencia";
import { lerFotoDoComprovante } from "@/lib/qr-contingencia-server";

export const dynamic = "force-dynamic";

/**
 * A foto de um comprovante do QR de Contingência, ou a miniatura dela
 * (`?tam=mini`). Por que existe: ver enderecoDaFoto.
 *
 * A trava é a mesma da tela do motorista (temAcessoModulo, que também
 * deixa passar quem confere com "ver"), e a foto tem de ser da revenda
 * ativa. O bucket continua privado: sem sessão, o proxy manda para o login.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/qr/foto/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Foto não encontrada.", { status: 404 });

  const revendaId = await getRevendaId();
  if (!revendaId || !(await temAcessoModulo(MODULO_QR))) return new Response("Sem acesso.", { status: 403 });

  const mini = new URL(request.url).searchParams.get("tam") === "mini";
  const foto = await lerFotoDoComprovante(id, revendaId, mini);
  if (!foto) return new Response("Foto não encontrada.", { status: 404 });

  return new Response(new Uint8Array(foto.dados), {
    headers: {
      "Content-Type": foto.contentType,
      // private: é dado financeiro, só o navegador de quem viu guarda --
      // nada de CDN no meio. immutable: o arquivo de um id nunca muda.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
