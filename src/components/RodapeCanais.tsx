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
 * 03/09/2026).
 *
 * Sem QR, de proposito: a faixa e de uma linha (ver RodapeCanais). O QR
 * chegou a existir aqui -- gerado pela biblioteca qrcode e conferido
 * decodificando de volta com jsqr, que devolveu exatamente esta URL -- e
 * saiu junto com o cartao grande. Esta no commit df8936c se um dia
 * precisar do cartaz impresso.
 */
export const EPI_URL = "https://forms.office.com/r/MGf5xTSDzr";

/**
 * Os canais que não são módulo: ouvidoria e solicitação de EPI.
 *
 * Ficam no rodapé, sempre visíveis para todo mundo, sem depender de
 * liberação de acesso. Vale para os dois pelo mesmo motivo: um canal de
 * denúncia que só aparece para quem foi autorizado não é um canal de
 * denúncia, e um pedido de EPI que depende de permissão vira um EPI que
 * não se pede.
 *
 * OS DOIS NÃO TÊM O MESMO PESO, e a tela precisa dizer isso.
 *
 * Nasceram lado a lado, do mesmo tamanho, e o dono viu o problema na
 * hora: o EPI "está tomando a evidência do canal de ouvidoria". Ele tem
 * razão -- pedir bota é rotina, e denunciar é a coisa mais difícil que
 * alguém faz neste app. Dar a mesma área aos dois faz o barulho do
 * comum abafar o que precisa de coragem.
 *
 * A ouvidoria fica com o cartão inteiro e o QR; o EPI, com uma faixa de
 * uma linha -- um terço da altura, e continua achável em um toque.
 *
 * A ORDEM é o EPI em cima, e ela não contradiz o parágrafo acima: quem
 * separa os dois é o TAMANHO, não a posição. Pedir EPI é o que acontece
 * toda semana; deixar o item frequente na frente é o que se faz em
 * qualquer lista. A ouvidoria continua sendo a peça grande, com QR e
 * botão azul -- ela não precisa vir primeiro para ser a mais visível.
 */
export function RodapeCanais() {
  return (
    <footer className="mt-10 space-y-3 border-t border-slate-200 pt-6">
      {/* A faixa do EPI: uma linha, sem QR e sem botão colorido. O
          formulário se abre com um toque no próprio retângulo -- um botão
          dentro de uma faixa desta altura seria um alvo dentro de outro,
          do mesmo tamanho. */}
      <a
        href={EPI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50"
      >
        <span className="shrink-0 text-lg" aria-hidden="true">
          🦺
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Solicitação de EPI</span>
          <span className="block truncate text-xs text-slate-500">
            Bota, luva, óculos e o que mais precisar para trabalhar seguro
          </span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden="true">
          ›
        </span>
      </a>

      <div className="flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* No próprio celular ninguém escaneia a própria tela -- o QR é
            para mostrar a outra pessoa ou imprimir e colar na parede. Quem
            está com o app aberto usa o link. Por isso o link é o alvo de
            toque grande e o QR fica do lado, pequeno. */}
        <QrOuvidoria className="h-24 w-24 shrink-0 rounded-lg border border-slate-200" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">🗣️ Canal de Ouvidoria</p>
          <p className="mt-1 text-xs text-slate-500">
            Denúncias, sugestões e outros assuntos. Aponte a câmera para o QR ou toque no botão.
          </p>
          <a
            href={OUVIDORIA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Abrir a ouvidoria →
          </a>
        </div>
      </div>
    </footer>
  );
}
