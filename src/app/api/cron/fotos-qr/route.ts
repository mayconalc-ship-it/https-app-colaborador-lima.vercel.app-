import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { caminhoDaMiniatura } from "@/lib/foto-privada-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RETENÇÃO DAS FOTOS DO QR DE CONTINGÊNCIA (21/11/2026, pedido do dono):
 * foto de comprovante com mais de 30 dias sai sozinha, todo dia, pelo cron
 * da Vercel (vercel.json). Antes era o scripts/apagar-fotos-qr.mjs rodado
 * à mão. O comprovante fica (cliente, valor, NF, conferência, edições);
 * saem a foto e a miniatura, conferido ou não (decisão do dono: ~90% nunca
 * é conferido, e esperar a conferência faria o bucket crescer sem fim).
 *
 * "Mais de 30 dias" pelo dia do comprovante, no fuso da operação: hoje
 * menos 31 é o último dia que sai. Lote a lote, a linha só sai do banco
 * depois que o arquivo saiu do bucket; um teto por execução deixa o resto
 * para o dia seguinte, dentro do tempo da função.
 *
 * Fica fora da sessão (exceção de api/cron no proxy); a Vercel manda o
 * CRON_SECRET no Authorization.
 */
const DIAS = 30;
const TETO_POR_EXECUCAO = 3000;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const limite = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() - (DIAS + 1) * 86_400_000),
  );

  const ids: number[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabase
      .from("qr_comprovantes")
      .select("id")
      .lte("data", limite)
      .order("id")
      .range(a, a + 999);
    if (error) return NextResponse.json({ erro: `Comprovantes: ${error.message}` }, { status: 500 });
    ids.push(...data.map((c) => c.id as number));
    if (data.length < 1000) break;
  }

  const fotos: { id: number; caminho: string }[] = [];
  for (let i = 0; i < ids.length && fotos.length < TETO_POR_EXECUCAO; i += 150) {
    const { data, error } = await supabase
      .from("qr_comprovante_fotos")
      .select("id, caminho")
      .in("comprovante_id", ids.slice(i, i + 150));
    if (error) return NextResponse.json({ erro: `Fotos: ${error.message}` }, { status: 500 });
    fotos.push(...data);
  }
  const alvo = fotos.slice(0, TETO_POR_EXECUCAO);

  let apagadas = 0;
  for (let i = 0; i < alvo.length; i += 100) {
    const lote = alvo.slice(i, i + 100);
    const caminhos = lote.map((f) => f.caminho);
    const { error: erroBucket } = await supabase.storage
      .from("comprovantes")
      .remove([...caminhos, ...caminhos.map(caminhoDaMiniatura)]);
    if (erroBucket) {
      return NextResponse.json({ erro: `Bucket: ${erroBucket.message}`, apagadas, limite }, { status: 500 });
    }
    const { error: erroBanco } = await supabase
      .from("qr_comprovante_fotos")
      .delete()
      .in("id", lote.map((f) => f.id));
    if (erroBanco) {
      return NextResponse.json({ erro: `Banco: ${erroBanco.message}`, apagadas, limite }, { status: 500 });
    }
    apagadas += lote.length;
  }

  return NextResponse.json({ limite, apagadas, restam: fotos.length > alvo.length });
}
