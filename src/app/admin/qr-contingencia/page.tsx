import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { decodificar } from "@/lib/texto-url";
import { MODULO_QR, formatarCnpj } from "@/lib/qr-contingencia";
import { lerConfigQr } from "@/lib/qr-contingencia-server";
import { FormConfigQr } from "./FormConfigQr";

export const dynamic = "force-dynamic";

export default async function AdminQrContingenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo(MODULO_QR, "ver");
  const sp = await searchParams;
  const revendaId = await exigirRevenda("/admin");
  const [config, podeEditar] = await Promise.all([lerConfigQr(revendaId), podeNoModulo(MODULO_QR, "editar")]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="📲 Comprovante de Pagamento"
        subtitle="O QR Code do PIX da empresa que o motorista mostra quando o pagamento do sistema cai"
      />
      {sp.erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>}

      {podeEditar ? (
        <FormConfigQr
          inicial={{
            qrUrl: config.qrUrl,
            favorecido: config.favorecido ?? "",
            cnpj: config.cnpj ?? "",
            chavePix: config.chavePix ?? "",
            instrucoes: config.instrucoes ?? "",
          }}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p>{config.favorecido ?? "Favorecido não informado"}</p>
          <p>{config.cnpj ? `CNPJ ${formatarCnpj(config.cnpj)}` : "CNPJ não informado"}</p>
          <p className="mt-2 text-xs text-slate-500">Você pode ver, mas não alterar o QR.</p>
        </div>
      )}

      {config.atualizadoEm && (
        <p className="text-xs text-slate-400">
          Atualizado em {new Date(config.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          {config.atualizadoPorNome && ` por ${config.atualizadoPorNome}`}.
        </p>
      )}

      <Link href="/gestao/comprovantes-qr" className="inline-block text-sm font-semibold text-primary underline">
        Ver os comprovantes registrados →
      </Link>
    </div>
  );
}
