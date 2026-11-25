import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { contextoGestorLog } from "@/lib/gestor-log-server";

export const dynamic = "force-dynamic";

/**
 * O Gestor LOG online (19/11/2026). O HTML é o mesmo programa do arquivo
 * Gestor LOG.html, gerado pelo gerar.js do Gestor LOG sem a base embutida
 * (gestor-log/gestor-log.html, ver o LEIA-ME da pasta). Os dados vêm da
 * base compartilhada, por /api/gestor-log.
 *
 * Rota e não página: o programa é uma tela cheia com o próprio topo, as
 * próprias abas e o próprio CSS -- dentro do layout do app ficaria com
 * dois cabeçalhos e os estilos de um brigando com os do outro.
 *
 * O login é o do app (o proxy manda para /login quem não entrou); aqui
 * confere o módulo. A configuração vai injetada no lugar da marca
 * <!--__NUVEM__--> -- é ela que liga a base compartilhada no programa.
 */
let cache: { html: string; hash: string; em: number } | null = null;

async function lerHtml() {
  // relido a cada 60 s no máximo: em produção o arquivo só muda com deploy
  if (cache && Date.now() - cache.em < 60_000) return cache;
  const html = await readFile(path.join(process.cwd(), "gestor-log", "gestor-log.html"), "utf8");
  cache = { html, hash: createHash("sha1").update(html).digest("hex").slice(0, 16), em: Date.now() };
  return cache;
}

export async function GET(request: Request) {
  const ctx = await contextoGestorLog();
  if (!ctx) {
    const url = new URL("/", request.url);
    url.searchParams.set("erro", "Você não tem acesso ao Gestor LOG. Fale com o dono do app.");
    return NextResponse.redirect(url);
  }

  let html: string, hash: string;
  try {
    ({ html, hash } = await lerHtml());
  } catch {
    return new NextResponse("O Gestor LOG ainda não foi publicado no app (falta gestor-log/gestor-log.html).", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // ?versao (23/11/2026): só a versão publicada, para o programa aberto avisar que saiu uma nova (sem baixar o HTML todo)
  if (new URL(request.url).searchParams.has("versao")) {
    const versao = html.match(/<meta name="versao" content="([^"]*)"/)?.[1] ?? null;
    return NextResponse.json({ versao }, { headers: { "cache-control": "private, no-store" } });
  }

  const cfg = {
    api: "/api/gestor-log",
    usuario: ctx.nome,
    podeEditar: ctx.podeEditar,
    revendas: [...ctx.revendas],
  };
  // "<" escapado: um nome com "</script>" não fecha a tag
  const script = `<script>window.GESTOR_NUVEM=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;

  // velocidade (25/11/2026): o programa tem ~2 MB e só muda com deploy. O navegador guarda a cópia e, a cada abertura,
  // pergunta se mudou (If-None-Match); sem mudança a resposta é 304, sem corpo. A etiqueta junta a versão do arquivo e a
  // configuração da pessoa (nome, permissão, revendas): trocou qualquer uma, vem o programa novo. O login e o módulo
  // continuam conferidos acima em toda abertura.
  const etag = `"${hash}-${createHash("sha1").update(script).digest("hex").slice(0, 12)}"`;
  const cabecalhos = { etag, "cache-control": "private, no-cache" };
  const pedida = request.headers.get("if-none-match") ?? "";
  if (pedida.split(",").some((x) => x.trim().replace(/^W\//, "") === etag)) {
    return new NextResponse(null, { status: 304, headers: cabecalhos });
  }

  return new NextResponse(html.replace("<!--__NUVEM__-->", () => script), {
    headers: { "content-type": "text/html; charset=utf-8", ...cabecalhos },
  });
}
