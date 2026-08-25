"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoModulo } from "@/lib/produtividade-armazem-server";
import { ehTurno, inteiroNaoNegativo } from "@/lib/produtividade-armazem";

const ROTA = "/produtividade-armazem/picking";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo(ROTA);

export async function iniciarPicking(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const turno = formData.get("turno");
  if (!ehTurno(turno)) erro("Escolha o turno.");

  const supabase = await createClient();
  const { error } = await supabase.from("pa_reabastecimentos_picking").insert({
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
    turno,
  });
  if (error) erro(`Não foi possível iniciar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reabastecimento+iniciado`);
}

export async function encerrarPicking(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const id = String(formData.get("id") ?? "");
  if (!id) erro("Registro inválido.");

  const area = String(formData.get("area") ?? "").trim().slice(0, 200) || null;
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const posicoesBruto = formData.get("posicoes_reabastecidas");
  let posicoes: number | null = null;
  if (posicoesBruto !== null && String(posicoesBruto).trim() !== "") {
    try {
      posicoes = inteiroNaoNegativo(posicoesBruto);
    } catch {
      erro("Número de posições inválido.");
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pa_reabastecimentos_picking")
    .update({
      fim: new Date().toISOString(),
      area,
      posicoes_reabastecidas: posicoes,
      observacao,
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .is("fim", null);

  if (error) erro(`Não foi possível encerrar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Reabastecimento+encerrado`);
}
