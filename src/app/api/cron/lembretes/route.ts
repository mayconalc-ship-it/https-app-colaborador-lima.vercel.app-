import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { getPessoasDaArea } from "@/lib/quiz-server";
import { hojeIso } from "@/lib/pesquisa";
import { diasRestantes } from "@/lib/quiz";
import type { AreaId } from "@/lib/areas";

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

  // Os dois lembretes do desafio moram na mesma rota porque compartilham
  // tudo o que importa: o mesmo segredo, o mesmo agendamento de 15 em 15
  // minutos e a mesma regra de carimbar antes de repetir. Uma segunda
  // rota só multiplicaria a chamada externa.
  const desafios = await lembretesDoDesafio(admin);

  const { data: devidos, error } = await admin
    .from("comunicados")
    .select("id, revenda_id, titulo, lembrete_cargos, lembrete_mensagem")
    .lte("lembrete_em", new Date().toISOString())
    .is("lembrete_enviado_em", null);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  if (!devidos || devidos.length === 0) {
    return NextResponse.json({ enviados: 0, desafios });
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

  return NextResponse.json({ enviados, desafios });
}

/**
 * Cutuca quem ainda não participou do Desafio do Mês.
 *
 * Dois toques por rodada, e só dois: um quando ela passa da metade
 * ("você ainda não participou") e outro na reta final ("últimos dias").
 * Mais que isso vira barulho, e barulho todo mês faz a pessoa desligar
 * a notificação -- perdendo também os avisos que ela queria.
 *
 * Idempotente pelos carimbos em `lembrete_meio_em` / `lembrete_fim_em`:
 * a rodada só entra na conta enquanto o carimbo dela for nulo, e o
 * carimbo é gravado mesmo quando não há ninguém para avisar -- senão a
 * mesma rodada voltaria à fila a cada 15 minutos para sempre.
 */
async function lembretesDoDesafio(admin: ReturnType<typeof createAdminClient>) {
  const hoje = hojeIso();

  const { data: rodadas } = await admin
    .from("quiz_rodadas")
    .select(
      "id, revenda_id, nome, area, inicio, fim, lembrete_meio_em, lembrete_fim_em",
    )
    .eq("status", "publicada")
    .lte("inicio", hoje)
    .gte("fim", hoje);

  let enviados = 0;

  for (const r of rodadas ?? []) {
    const faltam = diasRestantes(r.fim, hoje);
    const duracao = Math.max(1, diasRestantes(r.fim, r.inicio));

    // A reta final tem precedência: na última semana o aviso certo é
    // "está acabando", não "você ainda não entrou" -- mesmo que o
    // lembrete do meio nunca tenha saído (rodada curta, por exemplo).
    let etapa: "fim" | "meio" | null = null;
    if (faltam <= 2) {
      if (!r.lembrete_fim_em) etapa = "fim";
    } else if (!r.lembrete_meio_em && faltam <= Math.floor(duracao / 2)) {
      etapa = "meio";
    }
    if (!etapa) continue;

    const carimbo =
      etapa === "fim"
        ? { lembrete_fim_em: new Date().toISOString() }
        : { lembrete_meio_em: new Date().toISOString() };

    const [pessoas, { data: concluiram }] = await Promise.all([
      getPessoasDaArea(r.revenda_id, r.area as AreaId),
      admin
        .from("quiz_participacoes")
        .select("colaborador_id")
        .eq("rodada_id", r.id)
        .eq("status", "concluida"),
    ]);

    const jaFizeram = new Set((concluiram ?? []).map((p) => p.colaborador_id));
    const alvo = pessoas.filter((id) => !jaFizeram.has(id));

    await admin.from("quiz_rodadas").update(carimbo).eq("id", r.id);
    if (alvo.length === 0) continue;

    const titulo =
      etapa === "fim" ? "⏰ Últimos dias do desafio" : "🔥 Você ainda não participou";
    const mensagem =
      etapa === "fim"
        ? `${r.nome} fecha ${faltam <= 0 ? "hoje" : `em ${faltam} dia${faltam === 1 ? "" : "s"}`}. Ainda dá tempo.`
        : `${r.nome} está aberto e você ainda não entrou. São poucos minutos.`;

    await Promise.all(
      alvo.map((colaboradorId) =>
        criarNotificacao({
          modulo: "quiz",
          tipo: "lembrete",
          titulo,
          mensagem,
          url: "/desafio",
          revendaId: r.revenda_id,
          destinatarioId: colaboradorId,
        }),
      ),
    );

    await enviarPushDaRevenda(r.revenda_id, {
      modulo: "quiz",
      titulo,
      mensagem,
      url: "/desafio",
      apenas: alvo,
    });

    enviados += alvo.length;
  }

  return enviados;
}
