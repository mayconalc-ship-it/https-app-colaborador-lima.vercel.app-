/*
 * Service worker do App Colaborador.
 *
 * Existe por um motivo só: receber push. Nao faz cache de pagina nem
 * funciona offline -- misturar as duas coisas aqui criaria o pior dos
 * bugs de app interno, que e a pessoa ver escala velha achando que e a
 * de hoje. Se um dia houver offline, ele nasce em outro arquivo.
 */

// Assume o controle sem esperar a pessoa fechar todas as abas. Sem isso,
// uma versao nova do worker so passaria a valer no dia seguinte.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) =>
  evento.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    // Push sem corpo legivel ainda merece aparecer: melhor um aviso
    // generico do que silencio.
    dados = {};
  }

  const titulo = dados.titulo || "App Colaborador";
  const opcoes = {
    body: dados.mensagem || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // A tag agrupa: dois comunicados seguidos substituem um ao outro em
    // vez de empilhar duas notificacoes iguais na barra.
    tag: dados.tag || "geral",
    data: { url: dados.url || "/" },
    // Sem vibracao longa: muita gente usa o celular no bolso durante a
    // rota e um tremor comprido assusta mais do que informa.
    vibrate: [80, 40, 80],
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/";

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Se o app ja esta aberto, reaproveita a aba em vez de abrir outra.
      // Abrir a terceira aba do mesmo app e uma forma boa de irritar.
      for (const aba of abas) {
        if (aba.url.includes(self.location.origin)) {
          await aba.focus();
          if ("navigate" in aba) await aba.navigate(destino);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
