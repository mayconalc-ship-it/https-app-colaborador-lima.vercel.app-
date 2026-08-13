import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/**
 * Dispara os lembretes de comunicado vencidos.
 *
 * Chamada de fora (GitHub Actions, a cada 15 min -- ver
 * .github/workflows/lembretes.yml), não pelo próprio app: o plano Hobby
 * da Vercel só libera cron nativo uma vez por dia, cedo demais para um
 * lembrete marcado para uma hora específica. A rota não sabe quem a
 * chamou, só CONFERE o segredo -- por isso não há sessão nem cookie aqui,
 * e cada aviso carrega a revenda do comunicado explicitamente.
 *
 * Idempotente por desenho: cada comunicado só entra na consulta enquanto
 * `lembrete_enviado_em` for nulo, e a primeira coisa que a linha recebe
 * depois de avisar é esse carimbo. Duas chamadas quase simultâneas (ex.:
 * um retry) na pior das hipóteses avisam duas vezes o mesmo comunicado,
 * nunca zero.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = request.headers.get("authorization");
  if (!segredo || recebido !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: devidos, error } = await admin
    .from("comunicados")
    .select("id, revenda_id, titulo, lembrete_cargos, lembrete_mensagem")
    .lte("lembrete_em", new Date().toISOString())
    .is("lembrete_enviado_em", null);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  if (!devidos || devidos.length === 0) {
    return NextResponse.json({ enviados: 0 });
  }

  let enviados = 0;

  for (const c of devidos) {
    const titulo = "🔔 Lembrete do Jornal";
    const mensagem = c.lembrete_mensagem?.trim() || c.titulo;
    const url = "/comunicados";
    const cargos = (c.lembrete_cargos ?? []).filter(Boolean);

    // Sem cargo marcado: vale para a revenda inteira, igual a um
    // comunicado normal. Com cargo: só quem tem esse cargo NESTA revenda
    // -- o mesmo cargo pode existir nas duas unidades.
    let alvo: string[] | null = null;
    if (cargos.length > 0) {
      const { data: vinculos } = await admin
        .from("colaborador_revendas")
        .select("colaborador_id")
        .eq("revenda_id", c.revenda_id);
      const idsRevenda = (vinculos ?? []).map((v) => v.colaborador_id);

      const { data: pessoas } = await admin
        .from("profiles")
        .select("id")
        .in("id", idsRevenda.length > 0 ? idsRevenda : [""])
        .in("cargo", cargos);
      alvo = (pessoas ?? []).map((p) => p.id);

      // Ninguém com esses cargos: marca como enviado mesmo assim, senão
      // este comunicado voltaria a aparecer na consulta a cada 15 min
      // para sempre.
      if (alvo.length === 0) {
        await admin
          .from("comunicados")
          .update({ lembrete_enviado_em: new Date().toISOString() })
          .eq("id", c.id);
        continue;
      }
    }

    if (alvo) {
      await Promise.all(
        alvo.map((colaboradorId) =>
          criarNotificacao({
            modulo: "comunicados",
            tipo: "lembrete",
            titulo,
            mensagem,
            url,
            revendaId: c.revenda_id,
            destinatarioId: colaboradorId,
          }),
        ),
      );
      await enviarPushDaRevenda(c.revenda_id, {
        modulo: "comunicados",
        titulo,
        mensagem,
        url,
        apenas: alvo,
      });
    } else {
      await criarNotificacao({
        modulo: "comunicados",
        tipo: "lembrete",
        titulo,
        mensagem,
        url,
        revendaId: c.revenda_id,
      });
      await enviarPushDaRevenda(c.revenda_id, {
        modulo: "comunicados",
        titulo,
        mensagem,
        url,
      });
    }

    await admin
      .from("comunicados")
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq("id", c.id);
    enviados++;
  }

  return NextResponse.json({ enviados });
}
