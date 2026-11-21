import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_GESTOR_LOG,
  chaveDaPessoa,
  chaveValida,
  contextoGestorLog,
  pastaDaChave,
} from "@/lib/gestor-log-server";

export const dynamic = "force-dynamic";

/**
 * A base compartilhada do Gestor LOG online (migration 182). Quem chama é
 * o app-nuvem.js de dentro do Gestor LOG, aberto em /gestor-log.
 *
 * Os arquivos não passam por aqui: a rota só entrega links assinados e o
 * navegador sobe/baixa direto do Storage. A base de uma revenda passa de
 * 4,5 MB sem compactar, e esse é o teto do corpo de uma rota na Vercel.
 *
 *   manifesto  chaves, versões e quem atualizou (só das revendas da pessoa)
 *   baixar     links de leitura das chaves pedidas (5 min)
 *   subir      link de envio de uma versão nova (precisa de "editar")
 *   confirmar  a versão enviada passa a valer; a anterior é apagada
 *   apagar     tira a chave da base (descartar a base de uma revenda)
 */
type Pedido = {
  acao?: string;
  chave?: unknown;
  chaves?: unknown;
  gz?: unknown;
  caminho?: unknown;
  versao?: unknown;
  tamanho?: unknown;
};

const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });

export async function POST(request: Request) {
  const ctx = await contextoGestorLog();
  if (!ctx) return erro("Sem acesso ao Gestor LOG.", 403);

  let p: Pedido;
  try {
    p = (await request.json()) as Pedido;
  } catch {
    return erro("Pedido inválido.");
  }

  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET_GESTOR_LOG);

  if (p.acao === "manifesto") {
    const { data, error } = await admin
      .from("gestor_log_dados")
      .select("chave, versao, caminho, tamanho, atualizado_em, atualizado_por_nome");
    if (error) return erro(error.message, 500);
    const chaves = (data ?? [])
      .filter((x) => chaveDaPessoa(ctx, x.chave))
      .map((x) => ({
        chave: x.chave,
        versao: Number(x.versao),
        caminho: x.caminho,
        tamanho: x.tamanho,
        em: x.atualizado_em,
        por: x.atualizado_por_nome,
      }));
    return NextResponse.json({ chaves, podeEditar: ctx.podeEditar });
  }

  if (p.acao === "baixar") {
    const pedidas = Array.isArray(p.chaves) ? p.chaves.filter(chaveValida) : [];
    const minhas = pedidas.filter((c) => chaveDaPessoa(ctx, c));
    if (!minhas.length) return NextResponse.json({ urls: {} });
    const { data, error } = await admin
      .from("gestor_log_dados")
      .select("chave, caminho")
      .in("chave", minhas);
    if (error) return erro(error.message, 500);
    const linhas = data ?? [];
    if (!linhas.length) return NextResponse.json({ urls: {} });
    const { data: links, error: e2 } = await storage.createSignedUrls(
      linhas.map((x) => x.caminho),
      300,
    );
    if (e2) return erro(e2.message, 500);
    const porCaminho = new Map((links ?? []).map((l) => [l.path, l.signedUrl]));
    const urls: Record<string, string> = {};
    for (const x of linhas) {
      const u = porCaminho.get(x.caminho);
      if (u) urls[x.chave] = u;
    }
    return NextResponse.json({ urls });
  }

  // caixa de entrada do carteiro (migration 183): só quem grava processa
  if (p.acao === "entrada") {
    const { data: ultimo } = await admin
      .from("gestor_log_entrada")
      .select("recebido_em")
      .order("recebido_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ctx.podeEditar) return NextResponse.json({ itens: [], ultimo: ultimo?.recebido_em ?? null });
    const { data, error } = await admin
      .from("gestor_log_entrada")
      .select("id, rev, nome, caminho, tamanho, modificado, recebido_em")
      .is("processado_em", null)
      .order("recebido_em");
    if (error) return erro(error.message, 500);
    const minhas = (data ?? []).filter((x) => ctx.revendas.has(x.rev));
    let links: { path: string | null; signedUrl: string | null }[] = [];
    if (minhas.length) {
      const r = await storage.createSignedUrls(minhas.map((x) => x.caminho), 600);
      if (r.error) return erro(r.error.message, 500);
      links = r.data ?? [];
    }
    const porCaminho = new Map(links.map((l) => [l.path, l.signedUrl]));
    const itens = minhas.map((x) => ({
      id: x.id,
      rev: x.rev,
      nome: x.nome,
      tamanho: x.tamanho,
      modificado: x.modificado,
      recebido: x.recebido_em,
      gz: x.caminho.endsWith(".gz"),
      dispo: x.caminho.includes("/dispo/"),
      otif: x.caminho.includes("/otif/"),
      estoque: x.caminho.includes("/estoque/"),
      url: porCaminho.get(x.caminho) ?? null,
    }));
    return NextResponse.json({ itens, ultimo: ultimo?.recebido_em ?? null });
  }

  if (p.acao === "entradaFeita") {
    if (!ctx.podeEditar) return erro("Sem permissão para gravar.", 403);
    const ids = Array.isArray(p.chaves) ? p.chaves.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return NextResponse.json({ ok: true });
    const { data } = await admin
      .from("gestor_log_entrada")
      .select("id, rev, caminho")
      .in("id", ids)
      .is("processado_em", null);
    const feitas = (data ?? []).filter((x) => ctx.revendas.has(x.rev));
    if (feitas.length) {
      const { error } = await admin
        .from("gestor_log_entrada")
        .update({ processado_em: new Date().toISOString(), processado_por_nome: ctx.nome })
        .in("id", feitas.map((x) => x.id));
      if (error) return erro(error.message, 500);
      await storage.remove(feitas.map((x) => x.caminho));
    }
    return NextResponse.json({ ok: true, feitas: feitas.length });
  }

  // daqui para baixo grava: precisa de "editar" e de ser da revenda da chave
  if (!ctx.podeEditar) return erro("Você só pode consultar o Gestor LOG (sem permissão para gravar).", 403);
  if (!chaveValida(p.chave)) return erro("Chave inválida.");
  const chave = p.chave;
  if (!chaveDaPessoa(ctx, chave)) return erro("Esta base é de uma revenda que não é a sua.", 403);
  const pasta = pastaDaChave(chave);

  if (p.acao === "subir") {
    const versao = Date.now();
    const caminho = `${pasta}/${versao}.json${p.gz === false ? "" : ".gz"}`;
    const { data, error } = await storage.createSignedUploadUrl(caminho);
    if (error || !data) return erro(error?.message ?? "Não foi possível preparar o envio.", 500);
    return NextResponse.json({ url: data.signedUrl, caminho, versao });
  }

  if (p.acao === "confirmar") {
    const caminho = typeof p.caminho === "string" ? p.caminho : "";
    const versao = Number(p.versao);
    // o caminho tem de ser o que "subir" entregou para esta chave
    if (!new RegExp(`^${pasta.replace("/", "\\/")}\\/\\d{13}\\.json(\\.gz)?$`).test(caminho) || !Number.isFinite(versao)) {
      return erro("Envio inválido.");
    }
    const { data: existe } = await storage.exists(caminho);
    if (!existe) return erro("O arquivo não chegou ao servidor. Tente de novo.", 409);

    const { data: atual } = await admin
      .from("gestor_log_dados")
      .select("versao, caminho")
      .eq("chave", chave)
      .maybeSingle();
    // duas pessoas gravando a mesma chave: vale a mais nova, a outra é descartada
    if (atual && Number(atual.versao) > versao) {
      await storage.remove([caminho]);
      return NextResponse.json({ versao: Number(atual.versao), descartada: true });
    }
    const tamanho = Number.isFinite(Number(p.tamanho)) ? Math.round(Number(p.tamanho)) : null;
    const { error } = await admin.from("gestor_log_dados").upsert({
      chave,
      versao,
      caminho,
      tamanho,
      atualizado_em: new Date().toISOString(),
      atualizado_por: ctx.perfilId,
      atualizado_por_nome: ctx.nome,
    });
    if (error) return erro(error.message, 500);
    if (atual && atual.caminho !== caminho) await storage.remove([atual.caminho]);
    return NextResponse.json({ versao });
  }

  if (p.acao === "apagar") {
    const { data: atual } = await admin
      .from("gestor_log_dados")
      .select("caminho")
      .eq("chave", chave)
      .maybeSingle();
    const { error } = await admin.from("gestor_log_dados").delete().eq("chave", chave);
    if (error) return erro(error.message, 500);
    if (atual) await storage.remove([atual.caminho]);
    return NextResponse.json({ ok: true });
  }

  return erro("Ação desconhecida.");
}
