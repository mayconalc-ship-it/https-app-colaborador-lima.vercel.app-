import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { linkDeCanalValido } from "@/lib/fontes-de-dados";

/**
 * OS CANAIS DO RODAPÉ, POR REVENDA (11/09/2026, implantação de Barreiras).
 *
 * Os dois links moravam aqui, fixos, e valiam para todas as revendas --
 * Barreiras abria a ouvidoria e o formulário de EPI de São Félix. Agora
 * vêm de `revenda_canais` (migration 113), editados em Fontes de Dados.
 *
 * Canal sem link não aparece. Um botão de ouvidoria que leva ao canal de
 * outra unidade é pior do que botão nenhum: a denúncia chega a quem não
 * pode agir sobre ela.
 *
 * Os links de hoje ficam aqui só como PONTE: enquanto a migration 113 não
 * roda, a tabela não existe e o rodapé continua exatamente como era. Depois
 * dela, quem manda é a tabela.
 */
const ANTES_DA_MIGRATION = {
  epi: "https://forms.office.com/r/MGf5xTSDzr",
  ouvidoria: "https://ouvidoria-limalogistica.lovable.app/",
};

type Canais = { epi: string | null; ouvidoria: string | null };

async function canaisDaRevenda(revendaId: string): Promise<Canais> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("revenda_canais")
    .select("epi_url, ouvidoria_url")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (error) {
    // Só a tabela ausente cai na ponte. Qualquer outro erro esconde os
    // canais: mostrar o link de São Félix em Barreiras por causa de uma
    // falha passageira seria o defeito que esta mudança existe para tirar.
    const tabelaAusente = error.code === "42P01" || error.code === "PGRST205";
    return tabelaAusente ? ANTES_DA_MIGRATION : { epi: null, ouvidoria: null };
  }

  // Validado de novo na hora de desenhar, e não só ao salvar: um link que
  // não seja http(s) nunca vira href -- nem se alguém gravar direto no banco.
  return {
    epi: linkDeCanalValido(data?.epi_url ?? ""),
    ouvidoria: linkDeCanalValido(data?.ouvidoria_url ?? ""),
  };
}

/**
 * O QR, gerado a partir do link salvo.
 *
 * Era um SVG fixo desenhado para o link de São Félix. Com um link por
 * revenda ele precisa nascer do endereço -- no servidor, na hora de montar
 * a tela, sem serviço externo: um QR que dependesse de outro site cairia
 * junto com ele.
 *
 * O desenho é o mesmo de antes: uma linha de traço por sequência de
 * módulos pretos, com a margem de 4 módulos que o leitor precisa.
 */
function QrDoLink({ url, className, rotulo }: { url: string; className?: string; rotulo: string }) {
  let tamanho = 0;
  let caminho = "";
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    tamanho = qr.modules.size;
    const preto = (linha: number, coluna: number) => qr.modules.data[linha * tamanho + coluna] === 1;
    const trechos: string[] = [];
    for (let y = 0; y < tamanho; y++) {
      let x = 0;
      while (x < tamanho) {
        if (!preto(y, x)) {
          x++;
          continue;
        }
        const inicio = x;
        while (x < tamanho && preto(y, x)) x++;
        trechos.push(`M${inicio + 4} ${y + 4.5}h${x - inicio}`);
      }
    }
    caminho = trechos.join("");
  } catch {
    // Link longo demais para um QR, ou qualquer falha da biblioteca: fica
    // só o botão, que é o caminho de quem está com o app aberto.
    return null;
  }

  const total = tamanho + 8;
  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={rotulo}
    >
      <path fill="#ffffff" d={`M0 0h${total}v${total}H0z`} />
      <path stroke="#0f172a" d={caminho} />
    </svg>
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
export async function RodapeCanais() {
  const revendaId = await getRevendaId();
  if (!revendaId) return null;

  const { epi, ouvidoria } = await canaisDaRevenda(revendaId);
  if (!epi && !ouvidoria) return null;

  return (
    <footer className="mt-10 space-y-3 border-t border-slate-200 pt-6">
      {/* A faixa do EPI: uma linha, sem QR e sem botão colorido. O
          formulário se abre com um toque no próprio retângulo -- um botão
          dentro de uma faixa desta altura seria um alvo dentro de outro,
          do mesmo tamanho. */}
      {epi && (
        <a
          href={epi}
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
      )}

      {ouvidoria && (
        <div className="flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* No próprio celular ninguém escaneia a própria tela -- o QR é
              para mostrar a outra pessoa ou imprimir e colar na parede. Quem
              está com o app aberto usa o link. Por isso o link é o alvo de
              toque grande e o QR fica do lado, pequeno. */}
          <QrDoLink
            url={ouvidoria}
            rotulo="QR Code do canal de ouvidoria"
            className="h-24 w-24 shrink-0 rounded-lg border border-slate-200"
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">🗣️ Canal de Ouvidoria</p>
            <p className="mt-1 text-xs text-slate-500">
              Denúncias, sugestões e outros assuntos. Aponte a câmera para o QR ou toque no botão.
            </p>
            <a
              href={ouvidoria}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Abrir a ouvidoria →
            </a>
          </div>
        </div>
      )}
    </footer>
  );
}
