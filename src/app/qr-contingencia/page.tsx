import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { MODULO_QR } from "@/lib/qr-contingencia";
import {
  COLUNAS_COMPROVANTE,
  comFotos,
  hojeNaOperacao,
  lerConfigQr,
} from "@/lib/qr-contingencia-server";
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

  const [config, { data: linhas }] = await Promise.all([
    lerConfigQr(revendaId),
    createAdminClient()
      .from("qr_comprovantes")
      .select(COLUNAS_COMPROVANTE)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id)
      .eq("data", hojeNaOperacao())
      .order("criado_em", { ascending: false }),
  ]);
  const meus = await comFotos(linhas ?? []);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <PageHeader title="📲 QR de Contingência" subtitle="Pagamento pelo PIX da empresa, com o comprovante registrado" />
      <TelaContingencia
        config={{
          qrUrl: config.qrUrl,
          favorecido: config.favorecido,
          cnpj: config.cnpj,
          chavePix: config.chavePix,
          instrucoes: config.instrucoes,
        }}
        meusDeHoje={meus.map((c) => ({
          id: c.id,
          mapa: c.mapa,
          codPdv: c.codPdv,
          clienteNome: c.clienteNome,
          valor: c.valor,
          hora: hora(c.criadoEm),
          fotos: c.fotos,
        }))}
      />
    </div>
  );
}
