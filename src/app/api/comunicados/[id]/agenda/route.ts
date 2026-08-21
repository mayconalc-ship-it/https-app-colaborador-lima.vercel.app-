import { createClient } from "@/lib/supabase/server";
import { montarIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * O compromisso da matéria, para o calendário do celular.
 *
 * É o destino do "reloginho" que aparece no comunicado: o colaborador
 * toca, o navegador baixa este arquivo e o celular abre o calendário
 * nativo já com o convite preenchido -- sem instalar nada, sem conta de
 * Google, e funcionando igual no Android e no iPhone.
 *
 * Rota de API, e não server action, pelo mesmo motivo do export do 5S: o
 * resultado é um ARQUIVO, com nome e tipo próprios.
 *
 * A data do compromisso é a do LEMBRETE (`lembrete_em`) -- é ela que
 * marca o que vai acontecer ("o treinamento é dia 15 às 14h"). A data de
 * publicação não serve: quando o colaborador lê a matéria, publicar já
 * aconteceu.
 *
 * Sem trava própria de propósito: a consulta usa o cliente da SESSÃO, e
 * não a service_role, então quem não enxerga o comunicado pela política
 * de leitura (outra revenda, ou matéria ainda agendada) recebe 404 aqui
 * pela mesma regra que vale na tela.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/comunicados/[id]/agenda">,
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: comunicado } = await supabase
    .from("comunicados")
    .select("id, titulo, resumo, lembrete_em, lembrete_mensagem")
    .eq("id", Number(id))
    .maybeSingle();

  if (!comunicado?.lembrete_em) {
    return new Response("Este comunicado não tem data marcada.", {
      status: 404,
    });
  }

  const origem = new URL(request.url).origin;
  const assinatura = "Jornal do Colaborador — LIMA Logística";
  const detalhe = [comunicado.lembrete_mensagem, comunicado.resumo]
    .map((t) => t?.trim())
    .find(Boolean);

  const ics = montarIcs({
    // O id do comunicado + o domínio: reabrir o link não duplica o
    // compromisso na agenda de quem já adicionou, atualiza.
    uid: `comunicado-${comunicado.id}@${new URL(origem).host}`,
    titulo: comunicado.titulo,
    descricao: detalhe ? `${detalhe}\n\n${assinatura}` : assinatura,
    url: `${origem}/comunicados`,
    inicio: new Date(comunicado.lembrete_em),
    duracaoMinutos: 30,
    // Meia hora antes: tempo de se deslocar sem virar aviso antecipado
    // demais, que a pessoa esquece de novo.
    alarmeMinutosAntes: 30,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // O nome do arquivo é o que o celular mostra ao abrir. Sem
      // acento nem espaço: alguns Android engasgam no cabeçalho.
      "Content-Disposition": `attachment; filename="comunicado-${comunicado.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
