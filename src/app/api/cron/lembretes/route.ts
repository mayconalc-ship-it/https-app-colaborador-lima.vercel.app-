import { NextResponse } from "next/server";
import { varrerLembretes } from "@/lib/lembretes-server";

export const dynamic = "force-dynamic";

/**
 * A porta de fora para a varredura dos lembretes.
 *
 * Quem faz o trabalho é `varrerLembretes` (em lib/lembretes-server), e a
 * razão de a lógica não morar aqui é que ela tem DOIS chamadores: esta
 * rota, batida de fora pelo GitHub Actions, e o próprio app a cada visita
 * (ver o `after()` no layout raiz). O app cobre o expediente, que é
 * quando comunicado importa; esta rota é a rede de segurança para
 * madrugada e fim de semana.
 *
 * Esta rota fica FORA da sessão -- veja a exceção de `api/cron` no
 * matcher do proxy. Ela não sabe quem a chamou, só confere o segredo, e
 * cada aviso carrega a revenda do comunicado explicitamente. Sem essa
 * exceção o proxy respondia 307 para /login e a rota nunca rodava.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = request.headers.get("authorization");
  if (!segredo || recebido !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const resultado = await varrerLembretes();

  return NextResponse.json(resultado, { status: resultado.erro ? 500 : 200 });
}
