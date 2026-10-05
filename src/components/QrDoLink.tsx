import QRCode from "qrcode";

/**
 * O QR, gerado a partir do link -- no servidor, na hora de montar a tela,
 * sem serviço externo: um QR que dependesse de outro site cairia junto
 * com ele.
 *
 * Nasceu no rodapé (canal de ouvidoria) e saiu de lá em 05/10/2026 para
 * servir também aos cartazes dos Chamados para Manutenção.
 *
 * O desenho: uma linha de traço por sequência de módulos pretos, com a
 * margem de 4 módulos que o leitor precisa.
 *
 * `nivel` é a correção de erro. "M" basta na tela; o cartaz colado na
 * parede do armazém pega poeira e risco, e "Q" ainda lê com um quarto
 * dele estragado.
 */
export function QrDoLink({
  url,
  className,
  rotulo,
  nivel = "M",
}: {
  url: string;
  className?: string;
  rotulo: string;
  nivel?: "L" | "M" | "Q" | "H";
}) {
  let tamanho = 0;
  let caminho = "";
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: nivel });
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
    // só o link, que é o caminho de quem está com o app aberto.
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
