"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { ehAreaValida } from "@/lib/areas";
import { lerData, lerReais, validarConfig, type ConfigBoasPraticas } from "@/lib/boas-praticas";

const ROTA = "/admin/boas-praticas/configuracao";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Áreas, calendário e premiação -- um Salvar para a tela toda. */
export async function salvarConfiguracao(formData: FormData) {
  const perfil = await requireModulo("boas-praticas-config", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const config: ConfigBoasPraticas = {
    todas_areas: formData.get("todas_areas") === "on",
    areas: [...new Set(formData.getAll("areas").map(String))].filter(ehAreaValida),
    sugestoes_ate: lerData(formData.get("sugestoes_ate")),
    votacao_ate: lerData(formData.get("votacao_ate")),
    divulgacao_em: lerData(formData.get("divulgacao_em")),
    premio_1: lerReais(formData.get("premio_1")),
    premio_2: lerReais(formData.get("premio_2")),
    premio_3: lerReais(formData.get("premio_3")),
  };

  const erro = validarConfig(config);
  if (erro) voltar("erro", erro);

  const admin = createAdminClient();
  const { error } = await admin.from("boas_praticas_config").upsert(
    {
      revenda_id: revendaId,
      ...config,
      atualizado_em: new Date().toISOString(),
      atualizado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id" },
  );
  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/admin/boas-praticas");
  revalidatePath("/boas-praticas");
  revalidatePath("/");
  voltar("sucesso", "Configuração salva.");
}
