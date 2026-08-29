"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { META_PADRAO_PCT, pctDoDia, precisaJustificar } from "@/lib/devolucao";

const ROTA = "/devolucao";

function voltar(
  filtro: { de?: string; ate?: string; dia?: string },
  chave: "erro" | "sucesso",
  mensagem: string,
): never {
  const p = new URLSearchParams();
  if (filtro.de) p.set("de", filtro.de);
  if (filtro.ate) p.set("ate", filtro.ate);
  if (filtro.dia) p.set("dia", filtro.dia);
  p.set(chave, mensagem);
  redirect(`${ROTA}?${p.toString()}`);
}

/**
 * A explicação do colaborador para um dia que passou da meta.
 *
 * É por DIA, não por nota: a meta é do dia, e pedir uma explicação por
 * nota faria a pessoa escrever cinco vezes a mesma coisa num dia ruim.
 *
 * O servidor reconfere que o dia realmente passou da meta. Sem isso, um
 * formulário reenviado depois de uma reimportação gravaria justificativa
 * em dia que já voltou ao normal.
 */
export async function justificarDia(formData: FormData) {
  const perfil = await requireAcessoModulo("devolucao", ROTA);

  const opcional = (n: string) => String(formData.get(n) ?? "").trim() || undefined;
  const filtro = { de: opcional("de"), ate: opcional("ate"), dia: opcional("dia") };

  const revendaId = await getRevendaId();
  if (!revendaId) voltar(filtro, "erro", "Você não está em nenhuma revenda.");

  const data = String(formData.get("data") ?? "").trim();
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) voltar(filtro, "erro", "Dia inválido.");
  if (!texto) voltar(filtro, "erro", "Escreva o que aconteceu antes de enviar.");

  const supabase = await createClient();

  // O RLS só entrega o dia se a pessoa for dele.
  const [{ data: dia }, { data: cfg }] = await Promise.all([
    supabase
      .from("devolucao_dia")
      .select("valor_entregue, valor_devolvido, valor_fora_do_indicador, motorista_colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("data", data)
      .maybeSingle(),
    supabase.from("devolucao_config").select("meta_pct").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  if (!dia) voltar(filtro, "erro", "Este dia não é seu ou não existe mais.");

  const meta = Number(cfg?.meta_pct ?? META_PADRAO_PCT);
  const pct = pctDoDia(
    Number(dia.valor_entregue),
    Number(dia.valor_devolvido),
    Number(dia.valor_fora_do_indicador),
  );
  if (!precisaJustificar(pct, meta)) {
    voltar(filtro, "erro", `Este dia ficou dentro da meta de ${meta}% — não precisa de justificativa.`);
  }

  const papel = dia.motorista_colaborador_id === perfil.id ? "motorista" : "ajudante";

  const { error } = await supabase.from("devolucao_justificativas").upsert(
    {
      revenda_id: revendaId,
      data,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      papel,
      texto,
      criado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,data,colaborador_id" },
  );

  if (error) voltar(filtro, "erro", `Não foi possível enviar: ${error.message}`);

  revalidatePath(ROTA);
  voltar(filtro, "sucesso", "Justificativa enviada. Obrigado!");
}
