import { PageHeader } from "@/components/PageHeader";
import { ConsultaRota } from "@/components/ConsultaRota";
import { createAdminClient } from "@/lib/supabase/admin";
import { METAS_PADRAO, type Metas } from "@/lib/rotas";

export default async function MinhaRotaPage() {
  const admin = createAdminClient();

  const { data: config } = await admin
    .from("rotas_config")
    .select("meta_ocupacao, meta_caixas")
    .eq("id", 1)
    .maybeSingle();

  const metas: Metas = {
    ocupacao: config?.meta_ocupacao ?? METAS_PADRAO.ocupacao,
    caixas: config?.meta_caixas ?? METAS_PADRAO.caixas,
  };

  return (
    <div>
      <PageHeader title="🚚 Minha Rota" subtitle="Consulte sua pré-rota" />
      <ConsultaRota metas={metas} />
    </div>
  );
}
