import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerConfigBoasPraticas } from "@/lib/boas-praticas-server";
import { areaDoColaborador } from "@/lib/quiz";
import { ehOwner } from "@/lib/acessos";
import { decodificar } from "@/lib/texto-url";
import type { AreaId } from "@/lib/areas";
import { FormConfiguracao } from "./FormConfiguracao";

export const dynamic = "force-dynamic";

/**
 * PROGRAMA BOAS PRÁTICAS -- a configuração (15/09/2026, pedido do dono).
 *
 * Mora em Configuração, e não junto da tela de Boas Práticas: aqui se
 * decide QUEM participa, QUANDO e QUANTO vale -- o dia a dia de analisar e
 * votar fica na outra.
 */
export default async function ConfiguracaoBoasPraticasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("boas-praticas-config", "ver");
  const sp = await searchParams;
  const [podeEditar, podeVerPrograma] = await Promise.all([
    podeNoModulo("boas-praticas-config", "editar"),
    podeNoModulo("boas-praticas", "ver"),
  ]);
  const revendaId = await exigirRevenda("/admin");

  const admin = createAdminClient();
  const [config, { data: vinculos }] = await Promise.all([
    lerConfigBoasPraticas(revendaId),
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
  ]);

  // Quantos há em cada área -- é o que mostra, antes de salvar, quem fica
  // de fora. Em lotes: a lista de ids vai na URL da consulta.
  const ids = [...new Set((vinculos ?? []).map((v) => v.colaborador_id as string))];
  const contagem: Record<AreaId | "sem", number> = { DU: 0, AL: 0, sem: 0 };
  for (let i = 0; i < ids.length; i += 150) {
    const { data: pessoas } = await admin
      .from("profiles")
      .select("area, role")
      .in("id", ids.slice(i, i + 150));
    for (const p of pessoas ?? []) {
      if (ehOwner(p.role as string)) continue;
      const area = areaDoColaborador(p.area as string | null);
      contagem[area ?? "sem"]++;
    }
  }

  return (
    <div>
      <PageHeader
        title="Programa Boas Práticas"
        subtitle="Quem participa, o calendário e a premiação"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      <FormConfiguracao inicial={config} contagem={contagem} podeEditar={podeEditar} />

      {podeVerPrograma && (
        <p className="mt-4 text-center text-sm">
          <Link href="/admin/boas-praticas" className="font-semibold text-primary underline">
            Ir para as sugestões e a votação →
          </Link>
        </p>
      )}
    </div>
  );
}
