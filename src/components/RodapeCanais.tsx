/**
 * CANAL DE OUVIDORIA -- rodapé da tela inicial.
 *
 * Não é módulo, é rodapé: pedido do dono. Fica sempre visível para todo
 * mundo, sem depender de liberação de acesso -- um canal de denúncia que
 * só aparece para quem foi autorizado a vê-lo não é um canal de denúncia.
 *
 * O QR é um SVG fixo, desenhado aqui mesmo. A URL não muda, então gerar
 * em tempo de execução (ou baixar de um serviço de QR) só acrescentaria
 * dependência, rede e uma forma de o rodapé aparecer quebrado.
 * Conferido decodificando de volta: aponta para OUVIDORIA_URL.
 */

export const OUVIDORIA_URL = "https://ouvidoria-limalogistica.lovable.app/";

function QrOuvidoria({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 41 41"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="QR Code do canal de ouvidoria"
    >
      <path fill="#ffffff" d="M0 0h41v41H0z" />
      <path
        stroke="#0f172a"
        d="M4 4.5h7m2 0h5m2 0h5m2 0h1m2 0h7M4 5.5h1m5 0h1m4 0h7m2 0h1m1 0h1m1 0h1m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h1m1 0h2m1 0h1m1 0h1m1 0h2m1 0h1m5 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m5 0h1m1 0h1m2 0h4m1 0h1m1 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m2 0h1m3 0h1m2 0h1m5 0h1m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m2 0h1m1 0h1m1 0h2m1 0h1m1 0h1m1 0h1m3 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h2m1 0h1m2 0h2m5 0h3M4 12.5h1m1 0h5m2 0h2m2 0h3m1 0h1m4 0h3m1 0h5M6 13.5h1m1 0h1m3 0h1m1 0h3m3 0h1m1 0h6m2 0h2m1 0h2m1 0h1M4 14.5h9m1 0h1m1 0h1m2 0h1m2 0h1m1 0h2m3 0h1m2 0h1m1 0h2M5 15.5h3m4 0h2m1 0h1m2 0h3m4 0h2m1 0h2m2 0h3M4 16.5h1m1 0h5m3 0h1m1 0h1m2 0h1m2 0h2m1 0h1m1 0h2m2 0h3m1 0h2M7 17.5h1m5 0h2m1 0h1m1 0h4m2 0h5m1 0h1m2 0h1m1 0h2M6 18.5h2m2 0h2m1 0h5m5 0h1m4 0h4m1 0h1m1 0h1M8 19.5h1m4 0h1m3 0h2m1 0h1m1 0h4m2 0h3m1 0h3M5 20.5h1m3 0h2m1 0h1m2 0h4m1 0h2m1 0h1m2 0h1m1 0h2m1 0h3m2 0h1M4 21.5h1m1 0h4m1 0h3m2 0h2m2 0h5m2 0h1m2 0h2m1 0h2m1 0h1M4 22.5h8m2 0h3m2 0h3m4 0h1m1 0h5m1 0h2M6 23.5h4m2 0h1m3 0h1m4 0h2m1 0h1m2 0h1m2 0h5m1 0h1M6 24.5h1m1 0h3m1 0h2m1 0h1m1 0h1m1 0h2m2 0h4m2 0h1m1 0h3m1 0h2M4 25.5h2m2 0h2m1 0h1m4 0h4m1 0h2m4 0h1m2 0h1m2 0h2m1 0h1M4 26.5h1m1 0h1m3 0h2m3 0h1m3 0h3m2 0h2m2 0h5m2 0h1M4 27.5h1m2 0h3m1 0h1m1 0h2m1 0h2m1 0h1m5 0h2m1 0h4m1 0h2M4 28.5h1m1 0h6m1 0h1m1 0h1m2 0h4m4 0h1m1 0h5m2 0h2M12 29.5h2m6 0h1m1 0h4m1 0h2m3 0h1m1 0h1m1 0h1M4 30.5h7m2 0h3m3 0h2m1 0h1m1 0h2m1 0h2m1 0h1m1 0h1m1 0h1M4 31.5h1m5 0h1m1 0h3m1 0h1m1 0h2m4 0h5m3 0h4M4 32.5h1m1 0h3m1 0h1m1 0h1m2 0h3m4 0h2m1 0h1m2 0h6M4 33.5h1m1 0h3m1 0h1m1 0h1m2 0h3m1 0h2m3 0h6m2 0h1m1 0h1m1 0h1M4 34.5h1m1 0h3m1 0h1m1 0h2m1 0h1m2 0h1m2 0h1m1 0h1m1 0h1m1 0h5m1 0h2M4 35.5h1m5 0h1m2 0h2m3 0h1m1 0h1m2 0h5m4 0h3M4 36.5h7m1 0h2m3 0h2m2 0h1m1 0h1m3 0h3m1 0h1m3 0h1"
      />
    </svg>
  );
}

/**
 * SOLICITAÇÃO DE EPI -- o segundo canal do rodapé (pedido do dono,
 * 03/09/2026), no mesmo formato da ouvidoria.
 *
 * O QR foi gerado pela biblioteca `qrcode` a partir da URL abaixo e
 * DECODIFICADO de volta com jsqr antes de entrar aqui: o texto lido é
 * exatamente EPI_URL. Um QR desenhado e não conferido é a pior espécie de
 * bug -- ele parece certo, imprime bonito, e leva a pessoa para o lugar
 * errado sem ninguém desconfiar.
 */
export const EPI_URL = "https://forms.office.com/r/MGf5xTSDzr";

function QrEpi({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 37 37"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="QR Code do formulário de solicitação de EPI"
    >
      <path fill="#ffffff" d="M0 0h37v37H0z" />
      <path
        stroke="#0f172a"
        d="M4 4.5h7m3 0h1m3 0h1m1 0h5m1 0h7M4 5.5h1m5 0h1m2 0h1m1 0h3m1 0h1m1 0h1m2 0h1m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h2m2 0h1m6 0h1m2 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m2 0h1m4 0h2m4 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h2m3 0h1m2 0h5m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m1 0h6m6 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h2m3 0h1m1 0h2m2 0h2M4 12.5h1m1 0h5m2 0h2m3 0h2m1 0h3m2 0h5M4 13.5h1m1 0h2m5 0h1m2 0h1m2 0h5m2 0h3m3 0h1M5 14.5h2m3 0h1m1 0h3m4 0h3m2 0h2m1 0h2M4 15.5h1m1 0h2m1 0h1m2 0h1m2 0h1m2 0h1m5 0h1m1 0h2m1 0h1m1 0h1M6 16.5h1m3 0h3m1 0h2m3 0h3m3 0h1m3 0h2M12 17.5h2m2 0h5m2 0h6m3 0h1M5 18.5h4m1 0h1m4 0h1m1 0h3m1 0h2m1 0h1m1 0h1m2 0h2M6 19.5h1m1 0h1m2 0h3m3 0h1m1 0h2m1 0h2m1 0h2m1 0h1m2 0h1M5 20.5h2m2 0h5m1 0h2m1 0h5m4 0h1m1 0h2M4 21.5h4m6 0h1m4 0h10m1 0h1m1 0h1M4 22.5h1m2 0h1m2 0h2m2 0h1m1 0h1m2 0h1m1 0h1m2 0h1m1 0h2m2 0h1M4 23.5h1m1 0h1m4 0h3m1 0h1m2 0h2m6 0h2m3 0h1M4 24.5h1m2 0h2m1 0h1m1 0h1m1 0h1m5 0h1m2 0h6m1 0h3M12 25.5h1m1 0h2m1 0h2m1 0h3m1 0h1m3 0h5M4 26.5h7m2 0h1m3 0h4m2 0h2m1 0h1m1 0h3M4 27.5h1m5 0h1m1 0h1m1 0h4m1 0h2m2 0h2m3 0h1M4 28.5h1m1 0h3m1 0h1m1 0h1m5 0h3m3 0h5m1 0h1M4 29.5h1m1 0h3m1 0h1m1 0h2m8 0h1m1 0h1m4 0h4M4 30.5h1m1 0h3m1 0h1m1 0h2m2 0h1m1 0h2m1 0h1m1 0h1m1 0h7M4 31.5h1m5 0h1m3 0h2m4 0h1m3 0h1m4 0h1m1 0h1M4 32.5h7m1 0h2m1 0h3m1 0h1m1 0h1m1 0h1m1 0h4m1 0h1"
      />
    </svg>
  );
}

function Canal({
  emoji,
  titulo,
  descricao,
  url,
  rotuloBotao,
  qr,
}: {
  emoji: string;
  titulo: string;
  descricao: string;
  url: string;
  rotuloBotao: string;
  qr: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* No próprio celular ninguém escaneia a própria tela -- o QR é
          para mostrar a outra pessoa ou imprimir e colar na parede. Quem
          está com o app aberto usa o link. Por isso o link é o alvo de
          toque grande e o QR fica do lado, pequeno. */}
      {qr}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">
          {emoji} {titulo}
        </p>
        <p className="mt-1 text-xs text-slate-500">{descricao}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {rotuloBotao} →
        </a>
      </div>
    </div>
  );
}

/**
 * Os canais que não são módulo: ouvidoria e solicitação de EPI.
 *
 * Ficam no rodapé, sempre visíveis para todo mundo, sem depender de
 * liberação de acesso. Vale para os dois pelo mesmo motivo: um canal de
 * denúncia que só aparece para quem foi autorizado não é um canal de
 * denúncia, e um pedido de EPI que depende de permissão vira um EPI que
 * não se pede.
 */
export function RodapeCanais() {
  return (
    <footer className="mt-10 border-t border-slate-200 pt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Canal
          emoji="🗣️"
          titulo="Canal de Ouvidoria"
          descricao="Denúncias, sugestões e outros assuntos. Aponte a câmera para o QR ou toque no botão."
          url={OUVIDORIA_URL}
          rotuloBotao="Abrir a ouvidoria"
          qr={<QrOuvidoria className="h-24 w-24 shrink-0 rounded-lg border border-slate-200" />}
        />
        <Canal
          emoji="🦺"
          titulo="Solicitação de EPI"
          descricao="Peça bota, luva, óculos e o que mais precisar para trabalhar seguro."
          url={EPI_URL}
          rotuloBotao="Solicitar EPI"
          qr={<QrEpi className="h-24 w-24 shrink-0 rounded-lg border border-slate-200" />}
        />
      </div>
    </footer>
  );
}
