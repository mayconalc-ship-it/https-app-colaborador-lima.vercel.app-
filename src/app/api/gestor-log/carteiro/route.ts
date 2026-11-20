import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_GESTOR_LOG, chaveDoCarteiro, nomeParaStorage } from "@/lib/gestor-log-server";
import { getPerfil } from "@/lib/sessao";
import { ehOwner } from "@/lib/acessos";

export const dynamic = "force-dynamic";

/**
 * Entrada do carteiro (etapa 2 do Gestor LOG online, migration 183).
 *
 * O carteiro é um programa num computador da empresa que olha a pasta
 * compartilhada do servidor (\\192.168.4.250\Compartilhado\<revenda>):
 * quem salvar um relatório ali alimenta o Gestor LOG, sem depender de uma
 * pessoa só. Ele não tem sessão do app -- esta rota está fora do login no
 * proxy, e a trava é a chave no cabeçalho x-chave.
 *
 * O arquivo não passa por aqui (o Pré-roteirização tem 23 MB, o teto de
 * uma rota na Vercel é 4,5 MB): "subir" entrega um link assinado, o
 * carteiro envia direto ao Storage e "confirmar" registra na caixa.
 */
const REVS = new Set(["SF", "BAR"]);
const EXT = /\.(csv|txt|xlsx|xls|xlsm)$/i;

const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });

/**
 * A chave do carteiro, só para o dono logado (abrir o endereço no
 * navegador). Ela é derivada da chave de serviço que está NA VERCEL, que
 * não é a mesma do .env.local -- por isso não dá para calcular fora daqui.
 */
export async function GET() {
  const perfil = await getPerfil();
  if (!perfil || !ehOwner(perfil.role)) return erro("Só o dono do app vê a chave do carteiro.", 403);
  return new NextResponse(
    `Chave do carteiro do Gestor LOG:\n\n${await chaveDoCarteiro()}\n\nCole em "chave" no C:\\Projetos\\gestor-log-carteiro\\config.json.\n`,
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const recebida = request.headers.get("x-chave") ?? "";
  const certa = await chaveDoCarteiro();
  if (recebida.length !== certa.length || !timingSafeEqual(Buffer.from(recebida), Buffer.from(certa))) {
    return erro("Chave do carteiro inválida.", 401);
  }

  let p: { acao?: string; rev?: string; nome?: string; caminho?: string; tamanho?: number; modificado?: number; gz?: boolean; tipo?: string };
  try {
    p = await request.json();
  } catch {
    return erro("Pedido inválido.");
  }
  const rev = String(p.rev ?? "");
  const nome = String(p.nome ?? "").slice(0, 200);
  if (!REVS.has(rev) || !EXT.test(nome)) return erro("Revenda ou arquivo inválido.");

  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET_GESTOR_LOG);

  if (p.acao === "subir") {
    // gz: o carteiro manda compactado (o Pré-roteirização cai de 24 MB para 1,7 MB: sobe e desce em segundos)
    // tipo "dispo" (20/11): planilha diária de disponibilidade da frota (pasta do Teams), vai para a aba Disponibilidade
    const sub = p.tipo === "dispo" ? "dispo/" : "";
    const caminho = `entrada/${rev}/${sub}${Date.now()}-${nomeParaStorage(nome)}${p.gz ? ".gz" : ""}`;
    const { data, error } = await storage.createSignedUploadUrl(caminho);
    if (error || !data) return erro(error?.message ?? "Não foi possível preparar o envio.", 500);
    return NextResponse.json({ url: data.signedUrl, caminho });
  }

  if (p.acao === "confirmar") {
    const caminho = String(p.caminho ?? "");
    if (!caminho.startsWith(`entrada/${rev}/`) || caminho.includes("..")) return erro("Envio inválido.");
    const { data: existe } = await storage.exists(caminho);
    if (!existe) return erro("O arquivo não chegou ao servidor.", 409);

    // versão nova do mesmo relatório ainda não processado: substitui a anterior
    const { data: antiga } = await admin
      .from("gestor_log_entrada")
      .select("id, caminho")
      .eq("rev", rev)
      .eq("nome", nome)
      .is("processado_em", null)
      .maybeSingle();
    if (antiga) {
      await admin.from("gestor_log_entrada").delete().eq("id", antiga.id);
      if (antiga.caminho !== caminho) await storage.remove([antiga.caminho]);
    }
    const { error } = await admin.from("gestor_log_entrada").insert({
      rev,
      nome,
      caminho,
      tamanho: Number.isFinite(Number(p.tamanho)) ? Number(p.tamanho) : null,
      modificado: Number.isFinite(Number(p.modificado)) ? Number(p.modificado) : null,
    });
    if (error) return erro(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  return erro("Ação desconhecida.");
}
