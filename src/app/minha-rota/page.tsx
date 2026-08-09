import { PageHeader } from "@/components/PageHeader";
import { ConsultaRota } from "@/components/ConsultaRota";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { METAS_PADRAO, type Metas } from "@/lib/rotas";

export default async function MinhaRotaPage() {
  const admin = createAdminClient();
  const revendaId = await getRevendaId();

  // Cada revenda tem a própria régua de ocupação; sem revenda, cai no
  // padrão do app em vez de mostrar a meta da unidade errada.
  const { data: config } = revendaId
    ? await admin
        .from("rotas_config")
        .select("meta_ocupacao, meta_caixas")
        .eq("revenda_id", revendaId)
        .maybeSingle()
    : { data: null };

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
