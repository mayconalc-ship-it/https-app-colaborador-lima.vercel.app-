import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";

/**
 * A BOMBONA ENCHENDO AVISA A LIDERANÇA (14/09/2026, pedido do dono).
 *
 * Até aqui o nível da bombona só existia no termômetro da tela de gestão
 * -- e ninguém tinha registrado um esvaziamento sequer, então ele nunca
 * zerava e ninguém sabia quando descartar.
 *
 * O nível só muda quando alguém FINALIZA um despejo, então o aviso sai
 * dali, na hora, e não de uma varredura: não há o que conferir entre um
 * despejo e outro. Dois marcos, e cada um toca UMA vez por ciclo da
 * bombona (de um esvaziamento ao próximo):
 *
 *   90%   programe o descarte;
 *   100%  passou da capacidade.
 *
 * A chave do aviso leva o id do último esvaziamento: registrou o
 * esvaziamento, começa um ciclo novo e os marcos voltam a valer. Quem
 * pulou de 85% para 105% num despejo recebe só o de 100%.
 *
 * Quem recebe: a liderança com "ver" no módulo do armazém -- a mesma
 * régua do botão "Esvaziei a bombona" (gestao/armazem/actions.ts). É quem
 * pode registrar o descarte.
 *
 * NUNCA lança erro: o despejo já foi gravado, e um aviso que falhou não
 * pode virar erro na tela de quem despejou.
 */
const CAPACIDADE_PADRAO = 1000;
const MARCOS = [100, 90] as const;

export async function avisarSeBombonaEncheu(revendaId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: ultimo }, { data: meta }] = await Promise.all([
      admin
        .from("pa_despejo_esvaziamentos")
        .select("id, esvaziada_em")
        .eq("revenda_id", revendaId)
        .order("esvaziada_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("pa_metas")
        .select("valor")
        .eq("revenda_id", revendaId)
        .eq("chave", "despejo_capacidade_bombona")
        .maybeSingle(),
    ]);

    // Mesma conta do termômetro da gestão: 1.000 L quando não há meta.
    const capacidade = Number(meta?.valor) > 0 ? Number(meta!.valor) : CAPACIDADE_PADRAO;

    // Paginado: o PostgREST corta em 1.000 linhas sem avisar, e um ciclo
    // longo de bombona sem esvaziamento passa disso.
    let litros = 0;
    for (let de = 0; ; de += 1000) {
      let consulta = admin
        .from("pa_despejo_lancamentos")
        .select("litros")
        .eq("revenda_id", revendaId)
        .not("fim", "is", null)
        .order("inicio", { ascending: true })
        .range(de, de + 999);
      if (ultimo) consulta = consulta.gte("inicio", ultimo.esvaziada_em);
      const { data } = await consulta;
      for (const l of data ?? []) litros += Number(l.litros) || 0;
      if (!data || data.length < 1000) break;
    }

    const pct = (litros / capacidade) * 100;
    const ciclo = ultimo?.id ?? "inicio";

    for (const marco of MARCOS) {
      if (pct < marco) continue;
      const chave = `bombona:${revendaId}:${ciclo}:${marco}`;
      // Já avisou este marco (ou, no caso do 90, o de 100): nada a fazer.
      const { data: jaFoi } = await admin
        .from("notificacoes")
        .select("id")
        .eq("modulo", "despejo")
        .eq("referencia_id", chave)
        .limit(1)
        .maybeSingle();
      if (jaFoi) return;

      const destinos = await liderancaDoArmazem(admin, revendaId);
      if (destinos.length === 0) return;

      const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      const titulo = marco === 100 ? "🪣 Bombona cheia" : "🪣 Bombona a 90%";
      const mensagem =
        marco === 100
          ? `${fmt(litros)} L de ${fmt(capacidade)} L — passou da capacidade. Descarte e registre o esvaziamento.`
          : `${fmt(litros)} L de ${fmt(capacidade)} L. Programe o descarte e registre o esvaziamento no app.`;
      const url = "/gestao/armazem";

      await Promise.all(
        destinos.map((id) =>
          criarNotificacao({
            modulo: "despejo",
            tipo: marco === 100 ? "pendencia" : "lembrete",
            titulo,
            mensagem,
            url,
            revendaId,
            destinatarioId: id,
            referenciaId: chave,
          }),
        ),
      );
      await enviarPushDaRevenda(revendaId, { modulo: "despejo", titulo, mensagem, url, apenas: destinos });
      return;
    }
  } catch {
    // Silêncio proposital: o despejo já foi gravado.
  }
}

/** Liderança com "ver" no módulo do armazém, nesta revenda. */
async function liderancaDoArmazem(
  admin: ReturnType<typeof createAdminClient>,
  revendaId: string,
): Promise<string[]> {
  const { data: permissoes } = await admin
    .from("lideranca_permissoes")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("modulo", "produtividade-armazem")
    .eq("acao", "ver");
  const ids = [...new Set((permissoes ?? []).map((p) => p.colaborador_id as string))];
  if (ids.length === 0) return [];
  // A permissão só vale para quem ainda é liderança (ver podeFazer em
  // lib/acessos.ts): quem voltou a colaborador fica fora do aviso.
  const { data: pessoas } = await admin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("role", "lideranca");
  return (pessoas ?? []).map((p) => p.id as string);
}
