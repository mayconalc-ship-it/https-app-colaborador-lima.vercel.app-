import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarPlanilhaDoLink, linhasDaPlanilha } from "@/lib/clientes-base-server";
import { lerListaVip, type PdvVip } from "@/lib/vips";

/**
 * OS PDVs VIP -- o lado do banco (08/11/2026). A regra de leitura está em
 * lib/vips.ts; o download é o mesmo da base de clientes.
 */

const LOTE = 500;

/** A migration 175 ainda não rodou. */
const naoInstalado = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message));

export async function importarVips(revendaId: string, link: string): Promise<{ ok: boolean; resumo?: string; erro?: string }> {
  const baixado = await baixarPlanilhaDoLink(link);
  if (baixado.erro) return { ok: false, erro: baixado.erro };

  let lista;
  try {
    lista = lerListaVip(await linhasDaPlanilha(baixado));
  } catch (e) {
    return { ok: false, erro: `não consegui ler a planilha: ${(e as Error).message}` };
  }
  if (lista.erro) return { ok: false, erro: lista.erro };
  if (lista.vips.length === 0) return { ok: false, erro: "nenhum PDV com código foi encontrado." };

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  // A lista TROCA a anterior: PDV que saiu da planilha deixa de ser VIP.
  const { error: eDel } = await admin.from("pa_pdv_vips").delete().eq("revenda_id", revendaId);
  if (naoInstalado(eDel)) return { ok: false, erro: "falta rodar a migration 175 no Supabase." };
  if (eDel) return { ok: false, erro: eDel.message };

  let gravados = 0;
  for (let i = 0; i < lista.vips.length; i += LOTE) {
    const { error } = await admin.from("pa_pdv_vips").insert(
      lista.vips.slice(i, i + LOTE).map((v) => ({
        revenda_id: revendaId,
        cod_pdv: v.codPdv,
        segmento: v.segmento,
        nome: v.nome,
        setor: v.setor,
        gv: v.gv,
        cidade: v.cidade,
        atualizado_em: agora,
      })),
    );
    if (!error) gravados += Math.min(LOTE, lista.vips.length - i);
  }

  const porSegmento = new Map<string, number>();
  for (const v of lista.vips) porSegmento.set(v.segmento, (porSegmento.get(v.segmento) ?? 0) + 1);
  const segs = [...porSegmento].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n} ${s}`).join(", ");
  const resumo =
    `${gravados} PDV(s) na lista (${segs})` +
    (lista.semCodigo ? `. ${lista.semCodigo} linha(s) sem código ignorada(s)` : "") +
    `. Colunas achadas: ${lista.colunas.join(", ")}.`;

  await admin
    .from("pa_vip_config")
    .upsert({ revenda_id: revendaId, pasta_link: link, ultima_sincronizacao: agora, ultimo_resultado: resumo, atualizado_em: agora }, { onConflict: "revenda_id" });

  return { ok: gravados > 0, resumo, erro: gravados < lista.vips.length ? `${lista.vips.length - gravados} PDV(s) não entraram.` : undefined };
}

/** Os VIPs entre estes códigos (os clientes de um mapa). Sem a 175: nenhum. */
export async function vipsEntre(revendaId: string, codigos: string[]): Promise<Map<string, PdvVip>> {
  const saida = new Map<string, PdvVip>();
  if (codigos.length === 0) return saida;
  const { data, error } = await createAdminClient()
    .from("pa_pdv_vips")
    .select("cod_pdv, segmento, nome, setor, gv, cidade")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos.slice(0, 1000));
  if (error) {
    if (naoInstalado(error)) return saida;
    throw new Error(error.message);
  }
  for (const v of data ?? []) {
    saida.set(v.cod_pdv as string, {
      codPdv: v.cod_pdv as string,
      segmento: (v.segmento as string) || "VIP",
      nome: (v.nome as string) ?? null,
      setor: (v.setor as string) ?? null,
      gv: (v.gv as string) ?? null,
      cidade: (v.cidade as string) ?? null,
    });
  }
  return saida;
}
