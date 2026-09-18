/*
 * Service worker do QR de Contingência -- SÓ desta tela (escopo
 * /qr-contingencia). 18/09/2026, pedido do dono: o QR tem de abrir sem
 * sinal, porque é justamente quando algo falhou que ele é usado.
 *
 * Por que um arquivo separado, e não o sw.js: o sw.js existe para push e
 * diz de propósito que não faz cache -- ver escala velha achando que é a
 * de hoje é o pior bug de app interno. Aqui o cache é o objetivo, e fica
 * preso a uma tela só. As notificações continuam com o sw.js.
 *
 * A regra:
 *   - a página: tenta a rede primeiro (dado fresco sempre que houver
 *     sinal); sem resposta em 4 s, usa a última versão guardada;
 *   - os arquivos do app (/_next/static/...): têm o nome com hash e nunca
 *     mudam -- guardados na primeira vez, servidos do celular depois;
 *   - todo o resto (envio de comprovante, busca de mapa): passa direto.
 *     Quem cuida de "sem sinal" nesses casos é a própria tela, com a fila.
 */

const CACHE = "qr-contingencia-v1";
const PAGINA = "/qr-contingencia";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) =>
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("qr-contingencia-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  ),
);

function comPrazo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, falha) => setTimeout(() => falha(new Error("prazo")), ms))]);
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // A página em si.
  if (pedido.mode === "navigate" && url.pathname.startsWith(PAGINA)) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const resposta = await comPrazo(fetch(pedido), 4000);
          // Só guarda a página de verdade -- não o redirecionamento para o
          // login, que substituiria a tela boa por uma que não serve.
          if (resposta.ok && !resposta.redirected) await cache.put(PAGINA, resposta.clone());
          return resposta;
        } catch {
          const guardada = await cache.match(PAGINA);
          if (guardada) return guardada;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
              "<body style='font-family:sans-serif;padding:24px'><h2>Sem internet</h2>" +
              "<p>Abra o QR de Contingência uma vez com sinal para ele passar a funcionar sem internet.</p></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // Os arquivos do app: nome com hash, nunca mudam.
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const resposta = await fetch(pedido);
        if (resposta.ok) {
          await cache.put(pedido, resposta.clone());
          // Cada publicação do app troca os nomes dos arquivos: sem teto,
          // o cache cresceria para sempre. Sai o mais antigo.
          const chaves = (await cache.keys()).filter((k) => new URL(k.url).pathname.startsWith("/_next/static/"));
          for (const velho of chaves.slice(0, Math.max(0, chaves.length - 200))) await cache.delete(velho);
        }
        return resposta;
      })(),
    );
  }
});
