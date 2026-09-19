import { PageHeader } from "@/components/PageHeader";
import { exigirRevenda } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { MODULO_QR } from "@/lib/qr-contingencia";
import { comprovantesDeHojeDaEquipe, lerConfigQr, paraTelaDoCelular } from "@/lib/qr-contingencia-server";
import { TelaContingencia } from "./TelaContingencia";

export const dynamic = "force-dynamic";

/**
 * QR DE CONTINGÊNCIA (18/09/2026, pedido do dono).
 *
 * O pagamento por QR do sistema caiu: o motorista mostra este QR (o PIX do
 * CNPJ da empresa), acha o cliente pelo mapa -- como na pré-rota -- e
 * fotografa o comprovante. Tudo numa tela, na ordem em que acontece na
 * frente do cliente.
 */
export default async function QrContingenciaPage() {
  const perfil = await requireAcessoModulo(MODULO_QR);
  const revendaId = await exigirRevenda("/");

  const [config, deHoje] = await Promise.all([
    lerConfigQr(revendaId),
    comprovantesDeHojeDaEquipe(revendaId, perfil.id),
  ]);

  return (
    <div>
      <PageHeader title="📲 Comprovante de Pagamento" subtitle="QR Code do PIX da empresa e o registro do comprovante" />
      <TelaContingencia
        config={{
          qrUrl: config.qrUrl,
          favorecido: config.favorecido,
          cnpj: config.cnpj,
          chavePix: config.chavePix,
          instrucoes: config.instrucoes,
        }}
        meusDeHoje={deHoje.map((c) => paraTelaDoCelular(c, perfil.id))}
      />
    </div>
  );
}
