import { NextResponse } from "next/server";
import { iniciarCheck } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * "FAZER CHECK" COMO LINK (26/11/2026). Era um botão de formulário, que só
 * funciona depois de a página terminar de carregar o JavaScript -- no
 * teste real, um toque antes disso recarregou a página e não abriu nada.
 * Um link funciona sempre: abre (ou retoma) o check do bimestre da placa
 * e leva para ele. As travas são as mesmas de iniciarCheck.
 */
export async function GET(request: Request, ctx: { params: Promise<{ veiculo: string }> }) {
  const { veiculo } = await ctx.params;
  const fd = new FormData();
  fd.set("veiculo_id", veiculo);
  const r = await iniciarCheck(fd);
  const destino = new URL(r.ok && r.irPara ? r.irPara : "/frota-check", request.url);
  if (!r.ok) destino.searchParams.set("erro", r.erro);
  return NextResponse.redirect(destino, { status: 303 });
}
