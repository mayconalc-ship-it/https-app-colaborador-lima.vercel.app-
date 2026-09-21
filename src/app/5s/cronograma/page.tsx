import { redirect } from "next/navigation";
import { getContexto5S } from "@/lib/cinco-s-server";
import { Cronograma } from "@/components/cinco-s/Cronograma";

export const dynamic = "force-dynamic";

/**
 * O CRONOGRAMA DE AUDITORIAS DO 5S (pedido do dono, 21/09/2026). Aberto a
 * quem participa do programa, como o BI; o conteúdo mora em
 * components/cinco-s/Cronograma.
 */
export default async function CronogramaPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await getContexto5S();
  if (!ctx) redirect("/");
  if (!ctx.temAcesso) redirect(`/5s?erro=${encodeURIComponent("Você ainda não participa do Programa 5S.")}`);
  const pedido = Number((await searchParams).ano);
  return <Cronograma revendaId={ctx.revendaId} anoPedido={pedido} />;
}
