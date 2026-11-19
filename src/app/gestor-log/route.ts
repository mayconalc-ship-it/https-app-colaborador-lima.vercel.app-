import { readFile } from "node:fs/promises";
import path from "node:path";
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
let cache: { html: string; em: number } | null = null;

async function lerHtml() {
  // relido a cada 60 s no máximo: em produção o arquivo só muda com deploy
  if (cache && Date.now() - cache.em < 60_000) return cache.html;
  const html = await readFile(path.join(process.cwd(), "gestor-log", "gestor-log.html"), "utf8");
  cache = { html, em: Date.now() };
  return html;
}

export async function GET(request: Request) {
  const ctx = await contextoGestorLog();
  if (!ctx) {
    const url = new URL("/", request.url);
    url.searchParams.set("erro", "Você não tem acesso ao Gestor LOG. Fale com o dono do app.");
    return NextResponse.redirect(url);
  }

  let html: string;
  try {
    html = await lerHtml();
  } catch {
    return new NextResponse("O Gestor LOG ainda não foi publicado no app (falta gestor-log/gestor-log.html).", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const cfg = {
    api: "/api/gestor-log",
    usuario: ctx.nome,
    podeEditar: ctx.podeEditar,
    revendas: [...ctx.revendas],
  };
  // "<" escapado: um nome com "</script>" não fecha a tag
  const script = `<script>window.GESTOR_NUVEM=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;

  return new NextResponse(html.replace("<!--__NUVEM__-->", () => script), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
